/**
 * ComfyUI-Block-Space V1 Adapter
 * 
 * Encapsulates all V1 (LiteGraph canvas) integration.
 * Imports pure spatial logic from core-math.js.
 * Exports initV1Adapter() to set up all patches.
 */

import {
  clampNumber,
  rangesOverlap,
  getNodeBounds,
  buildDimensionClusters,
  pickNearestMoveCluster,
  pickDirectionalCluster,
  getRaycastNeighbors,
  getRaycastNeighborsMulti,
  computeWinningXCandidate,
  getSettingValue,
  getHSnapMargin,
  getVSnapMargin,
  getSnapThreshold,
  isSnappingEnabled,
  getMoveSnapStrength,
  getResizeSnapStrength,
  getMoveYSnapStrength,
  getExitThresholdMultiplier,
  getDimensionTolerancePx,
  getHighlightEnabled,
  getHighlightColor,
  getFeedbackEnabled,
  getFeedbackPulseMs,
  getFeedbackColorX,
  getFeedbackColorY,
  getFeedbackColorXY,
} from './core-math.js';
import { onAnySettingChanged } from './settings-events.js';

// ============================================================================
// Constants
// ============================================================================

const SNAP_THRESHOLD = 10;
const SNAP_MOUSEUP_GRACE_MS = 220;
const SNAP_MOUSEUP_TOLERANCE_MULTIPLIER = 1.8;
const DIMENSION_ASSOC_LAYER_ID = "block-space-dimension-association-layer";
const CONNECTOR_FAN_SPACING = 8;

// ============================================================================
// State Storage
// ============================================================================

const V1State = {
  originalProcessMouseMove: null,
  originalProcessMouseUp: null,
  originalProcessMouseDown: null,
  originalRenderLink: null,
  originalDrawNodeCF: null,
  originalComputeSize: null,
  originalSetSize: null,
  originalConfigure: null,
  originalGraphAdd: null,
  originalDrawNodeSS: null,
  settingsUnsubscribe: null,
  // Event listener handlers for cleanup
  focusMouseupHandler: null,
  focusKeydownHandler: null,
  focusBlurHandler: null,
};

// ============================================================================
// Node Snapping Functions
// ============================================================================

function getCanvasScale(canvas) {
  const scale = canvas && canvas.ds ? Number(canvas.ds.scale) : 1;
  return isFinite(scale) && scale > 0 ? scale : 1;
}

function isLeftMouseDown(event) {
  if (!event) return false;
  const buttons = Number(event.buttons);
  if (isFinite(buttons) && buttons >= 0) return (buttons & 1) === 1;
  const which = Number(event.which);
  return which === 1;
}

function getActiveDraggedNode(canvas, event) {
  if (!canvas) return null;
  if (canvas.dragging_canvas || canvas.resizing_node || canvas.selected_group_resizing) return null;
  if (canvas.node_dragged && canvas.node_dragged.pos && canvas.node_dragged.size) return canvas.node_dragged;
  if (isLeftMouseDown(event) && canvas.last_mouse_dragging && canvas.current_node && canvas.current_node.pos && canvas.current_node.size && !canvas.connecting_node) {
    return canvas.current_node;
  }
  return null;
}

function getGraphNodes(canvas) {
  if (!canvas || !canvas.graph || !Array.isArray(canvas.graph._nodes)) return [];
  return canvas.graph._nodes;
}

function ensureResizeDimensionMemory(canvas, resizingNode) {
  if (!canvas || !resizingNode) return null;
  const memory = canvas.__blockSpaceResizeDimensionMemory;
  if (memory && memory.nodeId === resizingNode.id) return memory;

  const allNodes = getGraphNodes(canvas);
  const activeBounds = getNodeBounds(resizingNode);
  if (!activeBounds) return null;

  // Only consider nodes within reasonable distance for dimension snapping
  const padding = 300;
  const targetNodes = [];
  for (const n of allNodes) {
    if (!n || n === resizingNode || n.constructor?.name === "LGraphGroup") continue;
    const b = getNodeBounds(n);
    if (!b) continue;
    const isNearX = b.right >= (activeBounds.left - padding) && b.left <= (activeBounds.right + padding);
    const isNearY = b.bottom >= (activeBounds.top - padding) && b.top <= (activeBounds.bottom + padding);
    if (isNearX && isNearY) targetNodes.push(n);
  }

  const widthSamples = [], heightSamples = [], rightEdgeSamples = [], bottomEdgeSamples = [];
  const hSnapMargin = getHSnapMargin();
  const vSnapMargin = getVSnapMargin();

  for (const node of targetNodes) {
    const bounds = getNodeBounds(node);
    if (!bounds) continue;
    const targetWidth = bounds.right - bounds.left;
    const targetHeight = bounds.bottom - bounds.top;
    if (isFinite(targetWidth) && targetWidth > 0) widthSamples.push({ value: targetWidth, node });
    if (isFinite(targetHeight) && targetHeight > 0) heightSamples.push({ value: targetHeight, node });
    rightEdgeSamples.push({ value: bounds.right, node }, { value: bounds.left, node }, { value: bounds.left - hSnapMargin, node });
    bottomEdgeSamples.push({ value: bounds.bottom, node }, { value: bounds.top, node });
    bottomEdgeSamples.push({ value: bounds.top - vSnapMargin, node, edge: 'top' });
  }

  const tolerancePx = getDimensionTolerancePx();
  const newMemory = {
    nodeId: resizingNode.id,
    tolerancePx,
    widthClusters: buildDimensionClusters(widthSamples, tolerancePx),
    heightClusters: buildDimensionClusters(heightSamples, tolerancePx),
    rightEdgeClusters: buildDimensionClusters(rightEdgeSamples, tolerancePx),
    bottomEdgeClusters: buildDimensionClusters(bottomEdgeSamples, tolerancePx),
    sampleNodeCount: Math.max(widthSamples.length, heightSamples.length),
    createdAt: Date.now(),
  };
  canvas.__blockSpaceResizeDimensionMemory = newMemory;
  return newMemory;
}

function ensureMoveYPointMemory(canvas, activeNode, vSnapMargin) {
  if (!canvas || !activeNode) return null;
  const memory = canvas.__blockSpaceMoveYPointMemory;
  if (memory && memory.nodeId === activeNode.id) return memory;

  const allNodes = getGraphNodes(canvas);
  const activeBounds = getNodeBounds(activeNode);
  if (!activeBounds) return null;

  const selectedNodesMap = canvas.selected_nodes || null;
  const padding = 2000;
  const points = [];
  const activeHeight = activeBounds.bottom - activeBounds.top;

  for (const node of allNodes) {
    if (!node || node === activeNode || node.constructor?.name === "LGraphGroup") continue;
    if (selectedNodesMap && node.id != null && selectedNodesMap[node.id]) continue;
    const bounds = getNodeBounds(node);
    if (!bounds) continue;
    const isNearX = bounds.right >= (activeBounds.left - padding) && bounds.left <= (activeBounds.right + padding);
    const isNearY = bounds.bottom >= (activeBounds.top - padding) && bounds.top <= (activeBounds.bottom + padding);
    if (isNearX && isNearY) {
      points.push({ value: bounds.top, node, type: "top_flush" });
      points.push({ value: bounds.bottom - activeHeight, node, type: "bottom_flush" });
      points.push({ value: bounds.bottom + vSnapMargin, node, type: "stack_below" });
      points.push({ value: bounds.top - vSnapMargin - activeHeight, node, type: "stack_above" });
    }
  }

  const newMemory = { nodeId: activeNode.id, tolerancePx: getDimensionTolerancePx(), points, createdAt: Date.now() };
  canvas.__blockSpaceMoveYPointMemory = newMemory;
  return newMemory;
}

function ensureMoveXPointMemory(canvas, activeNode, hSnapMargin) {
  if (!canvas || !activeNode) return null;
  const memory = canvas.__blockSpaceMoveXPointMemory;
  if (memory && memory.nodeId === activeNode.id) return memory;

  const allNodes = getGraphNodes(canvas);
  const activeBounds = getNodeBounds(activeNode);
  if (!activeBounds) return null;

  const selectedNodesMap = canvas.selected_nodes || null;
  const padding = 2000;
  const points = [];
  const activeWidth = activeBounds.right - activeBounds.left;

  for (const node of allNodes) {
    if (!node || node === activeNode || node.constructor?.name === "LGraphGroup") continue;
    if (selectedNodesMap && node.id != null && selectedNodesMap[node.id]) continue;
    const bounds = getNodeBounds(node);
    if (!bounds) continue;
    const isNearX = bounds.right >= (activeBounds.left - padding) && bounds.left <= (activeBounds.right + padding);
    const isNearY = bounds.bottom >= (activeBounds.top - padding) && bounds.top <= (activeBounds.bottom + padding);
    if (isNearX && isNearY) {
      points.push({ value: bounds.left, node, type: "left_flush" });
      points.push({ value: bounds.right - activeWidth, node, type: "right_flush" });
      points.push({ value: bounds.left + (bounds.right - bounds.left) * 0.5 - activeWidth * 0.5, node, type: "center_flush" });
      points.push({ value: bounds.right + hSnapMargin, node, type: "stack_right" });
      points.push({ value: bounds.left - hSnapMargin - activeWidth, node, type: "stack_left" });
    }
  }

  const newMemory = { nodeId: activeNode.id, tolerancePx: getDimensionTolerancePx(), points, createdAt: Date.now() };
  canvas.__blockSpaceMoveXPointMemory = newMemory;
  return newMemory;
}

function getDragDelta(canvas, event) {
  if (!canvas || !event || typeof event.canvasX !== "number" || typeof event.canvasY !== "number") return { dx: 0, dy: 0 };
  const prev = canvas.__blockSpacePrevDragPoint;
  const current = { x: event.canvasX, y: event.canvasY };
  canvas.__blockSpacePrevDragPoint = current;
  if (!prev) return { dx: 0, dy: 0 };
  return { dx: current.x - prev.x, dy: current.y - prev.y };
}

function getResizeDelta(canvas, node) {
  if (!canvas || !node || !node.size || node.size.length < 2) return { dw: 0, dh: 0 };
  const current = { id: node.id != null ? node.id : null, w: Number(node.size[0]) || 0, h: Number(node.size[1]) || 0 };
  const prev = canvas.__blockSpacePrevResizeSize;
  canvas.__blockSpacePrevResizeSize = current;
  if (!prev || prev.id !== current.id) return { dw: 0, dh: 0 };
  return { dw: current.w - prev.w, dh: current.h - prev.h };
}

function getNodeMinSize(node) {
  let minWidth = 10, minHeight = 10;
  if (!node) return [minWidth, minHeight];
  if (node.min_size && node.min_size.length >= 2) {
    minWidth = Math.max(minWidth, Number(node.min_size[0]) || minWidth);
    minHeight = Math.max(minHeight, Number(node.min_size[1]) || minHeight);
  }
  let hasSmartMin = false;
  if (node.__smartMinSize && node.__smartMinSize.length >= 2) {
    minWidth = Math.max(minWidth, Number(node.__smartMinSize[0]) || minWidth);
    minHeight = Math.max(minHeight, Number(node.__smartMinSize[1]) || minHeight);
    hasSmartMin = true;
  }
  if (!hasSmartMin && typeof node.computeSize === "function") {
    try {
      const computed = node.computeSize(node.size?.length >= 1 ? node.size[0] : undefined);
      if (computed && computed.length >= 2) {
        minWidth = Math.max(minWidth, Number(computed[0]) || minWidth);
        minHeight = Math.max(minHeight, Number(computed[1]) || minHeight);
      }
    } catch (error) {}
  }
  return [minWidth, minHeight];
}

function applyResizeSnapping(canvas, resizingNode) {
  if (!canvas || !resizingNode || resizingNode.constructor?.name === "LGraphGroup") return false;
  const bounds = getNodeBounds(resizingNode);
  if (!bounds) return false;

  const thresholdCanvas = (SNAP_THRESHOLD / Math.max(0.0001, getCanvasScale(canvas))) * getResizeSnapStrength();
  const exitThresholdCanvas = thresholdCanvas * getExitThresholdMultiplier();
  const currentWidth = bounds.right - bounds.left;
  const currentHeight = bounds.bottom - bounds.top;
  const currentRight = bounds.right;
  const currentBottom = bounds.bottom;
  const minSize = getNodeMinSize(resizingNode);
  const memory = ensureResizeDimensionMemory(canvas, resizingNode);

  const widthWinner = memory ? pickDirectionalCluster(memory.widthClusters, currentWidth, "steady") : null;
  const heightWinner = memory ? pickDirectionalCluster(memory.heightClusters, currentHeight, "steady") : null;
  const rightEdgeWinner = memory ? pickNearestMoveCluster(memory.rightEdgeClusters, currentRight) : null;
  const bottomEdgeWinner = memory ? pickNearestMoveCluster(memory.bottomEdgeClusters, currentBottom) : null;

  let didSnap = false;
  let bestXWidth = null, bestXDelta = Infinity, bestXMode = null, bestXNodes = [];

  if (widthWinner) {
    bestXDelta = Math.abs(currentWidth - widthWinner.center);
    bestXWidth = widthWinner.center;
    bestXMode = "dimension_match";
    // Only show guide for closest node by spatial distance to active node
    const closest = widthWinner.members.slice().sort((a, b) => {
      const boundsA = a.node ? getNodeBounds(a.node) : null;
      const boundsB = b.node ? getNodeBounds(b.node) : null;
      if (!boundsA) return 1;
      if (!boundsB) return -1;
      const distA = Math.hypot(boundsA.centerX - bounds.centerX, boundsA.centerY - bounds.centerY);
      const distB = Math.hypot(boundsB.centerX - bounds.centerX, boundsB.centerY - bounds.centerY);
      return distA - distB;
    })[0];
    if (closest?.node) bestXNodes = [closest.node];
  }
  if (rightEdgeWinner) {
    const edgeDelta = Math.abs(currentRight - rightEdgeWinner.center);
    if (edgeDelta < (bestXDelta - 2)) {
      bestXDelta = edgeDelta;
      bestXWidth = rightEdgeWinner.center - bounds.left;
      bestXMode = "edge_align_right";
      // Only show guide for closest node by spatial distance to active node
      const closest = rightEdgeWinner.members.slice().sort((a, b) => {
        const boundsA = a.node ? getNodeBounds(a.node) : null;
        const boundsB = b.node ? getNodeBounds(b.node) : null;
        if (!boundsA) return 1;
        if (!boundsB) return -1;
        const distA = Math.hypot(boundsA.centerX - bounds.centerX, boundsA.centerY - bounds.centerY);
        const distB = Math.hypot(boundsB.centerX - bounds.centerX, boundsB.centerY - bounds.centerY);
        return distA - distB;
      })[0];
      if (closest?.node) bestXNodes = [closest.node];
    }
  }

  const recentSnap = canvas.__blockSpaceRecentSnap;
  const wasSnappedX = recentSnap && recentSnap.kind === "resize" && recentSnap.nodeId === resizingNode.id && recentSnap.xDidSnap;
  const currentThresholdX = wasSnappedX ? exitThresholdCanvas : thresholdCanvas;

  if (bestXWidth !== null && bestXDelta <= currentThresholdX) {
    const nextWidth = Math.max(minSize[0], bestXWidth);
    if (isFinite(nextWidth) && Math.abs(nextWidth - currentWidth) > 0.01) {
      resizingNode.size[0] = Math.round(nextWidth);
      didSnap = true;
    }
  }

  let bestYHeight = null, bestYDelta = Infinity, bestYMode = null, bestYNodes = [];
  const titleH = Number(window.LiteGraph?.NODE_TITLE_HEIGHT) || 24;

  if (heightWinner) {
    bestYDelta = Math.abs(currentHeight - heightWinner.center);
    bestYHeight = heightWinner.center;
    bestYMode = "dimension_match";
    // Only show guide for closest node by spatial distance to active node
    const closest = heightWinner.members.slice().sort((a, b) => {
      const boundsA = a.node ? getNodeBounds(a.node) : null;
      const boundsB = b.node ? getNodeBounds(b.node) : null;
      if (!boundsA) return 1;
      if (!boundsB) return -1;
      const distA = Math.hypot(boundsA.centerX - bounds.centerX, boundsA.centerY - bounds.centerY);
      const distB = Math.hypot(boundsB.centerX - bounds.centerX, boundsB.centerY - bounds.centerY);
      return distA - distB;
    })[0];
    if (closest?.node) bestYNodes = [closest.node];
  }
  if (bottomEdgeWinner) {
    const edgeDeltaY = Math.abs(currentBottom - bottomEdgeWinner.center);
    if (edgeDeltaY < (bestYDelta - 2)) {
      bestYDelta = edgeDeltaY;
      bestYHeight = bottomEdgeWinner.center - bounds.top;
      bestYMode = "edge_align_bottom";
      // Only show guide for closest node by spatial distance to active node
      const closest = bottomEdgeWinner.members.slice().sort((a, b) => {
        const boundsA = a.node ? getNodeBounds(a.node) : null;
        const boundsB = b.node ? getNodeBounds(b.node) : null;
        if (!boundsA) return 1;
        if (!boundsB) return -1;
        const distA = Math.hypot(boundsA.centerX - bounds.centerX, boundsA.centerY - bounds.centerY);
        const distB = Math.hypot(boundsB.centerX - bounds.centerX, boundsB.centerY - bounds.centerY);
        return distA - distB;
      })[0];
      if (closest?.node) bestYNodes = [closest.node];
    }
  }

  const wasSnappedY = recentSnap && recentSnap.kind === "resize" && recentSnap.nodeId === resizingNode.id && recentSnap.yDidSnap;
  const currentThresholdY = wasSnappedY ? exitThresholdCanvas : thresholdCanvas;

  if (bestYHeight !== null && bestYDelta <= currentThresholdY) {
    const nextContentHeight = Math.max(minSize[1], bestYHeight - titleH);
    if (isFinite(nextContentHeight) && Math.abs(nextContentHeight - resizingNode.size[1]) > 0.01) {
      resizingNode.size[1] = Math.round(nextContentHeight);
      didSnap = true;
    }
  }

  // Set status for guide rendering
  const xDidSnap = bestXWidth !== null && bestXDelta <= currentThresholdX;
  const yDidSnap = bestYHeight !== null && bestYDelta <= currentThresholdY;
  
  canvas.__blockSpaceResizeDebugStatus = {
    active: true,
    axis: "resize",
    xDidSnap: xDidSnap,
    yDidSnap: yDidSnap,
    xWinnerNodes: bestXNodes,
    yWinnerNodes: bestYNodes,
    activeLeft: bounds.left,
    activeTop: bounds.top,
    xTarget: xDidSnap ? bestXWidth : null,
    yTarget: yDidSnap ? bestYHeight : null,
  };

  return didSnap;
}

function clearSnapVisual(canvas) {
  if (!canvas || !canvas.__blockSpaceWinnerHighlight) return;
  canvas.__blockSpaceWinnerHighlight = null;
  canvas.dirty_canvas = true;
  canvas.dirty_bgcanvas = true;
}

function resetPersistedHighlightArtifacts(canvas) {
  clearSnapFeedbackState(canvas, true);
  if (!canvas) return;
  const nodes = getGraphNodes(canvas);
  let changed = false;
  for (const node of nodes) {
    if (!node || node.constructor?.name === "LGraphGroup") continue;
    if (Object.prototype.hasOwnProperty.call(node, "boxcolor")) {
      delete node.boxcolor;
      changed = true;
    }
  }
  if (changed) {
    canvas.dirty_canvas = true;
    canvas.dirty_bgcanvas = true;
  }
}

function rememberRecentSnap(canvas, snap) {
  if (!canvas || !snap) return;
  snap.at = Date.now();
  canvas.__blockSpaceRecentSnap = snap;
}

function getNodeById(nodes, id) {
  if (!nodes || id == null) return null;
  for (const node of nodes) {
    if (node && node.id === id) return node;
  }
  return null;
}

function maybeCommitSnapOnMouseUp(canvas, nodeHint) {
  if (!canvas) return false;
  const snap = canvas.__blockSpaceRecentSnap;
  if (!snap || !snap.at || Date.now() - snap.at > SNAP_MOUSEUP_GRACE_MS) return false;

  let node = nodeHint;
  if (!node || (snap.nodeId != null && node.id !== snap.nodeId)) {
    node = getNodeById(getGraphNodes(canvas), snap.nodeId);
  }
  if (!node || node.constructor?.name === "LGraphGroup" || !node.pos || !node.size) return false;

  const bounds = getNodeBounds(node);
  if (!bounds) return false;

  const tolerance = Math.max(2, (Number(snap.threshold) || 0) * SNAP_MOUSEUP_TOLERANCE_MULTIPLIER);
  let appliedX = false, appliedY = false;

  if (snap.kind === "move") {
    if (snap.xDidSnap && typeof snap.xTarget === "number" && Math.abs(bounds.left - snap.xTarget) <= tolerance) {
      node.pos[0] = Math.round(snap.xTarget);
      appliedX = true;
    }
    if (snap.yDidSnap && typeof snap.yTarget === "number" && Math.abs(bounds.top - snap.yTarget) <= tolerance) {
      node.pos[1] = Math.round(snap.yTarget);
      appliedY = true;
    }
  } else if (snap.kind === "resize") {
    const minSize = getNodeMinSize(node);
    const titleH = Number(window.LiteGraph?.NODE_TITLE_HEIGHT) || 24;
    if (snap.xDidSnap && typeof snap.xTargetRight === "number" && Math.abs(bounds.right - snap.xTargetRight) <= tolerance) {
      node.size[0] = Math.round(Math.max(minSize[0], snap.xTargetRight - bounds.left));
      appliedX = true;
    }
    if (snap.yDidSnap && typeof snap.yTargetBottom === "number" && Math.abs(bounds.bottom - snap.yTargetBottom) <= tolerance) {
      node.size[1] = Math.round(Math.max(minSize[1], (snap.yTargetBottom - bounds.top) - titleH));
      appliedY = true;
    }
  }

  return appliedX || appliedY;
}

function ensureDimensionAssociationLayer() {
  let layer = document.getElementById(DIMENSION_ASSOC_LAYER_ID);
  if (layer) return layer;
  layer = document.createElement("div");
  layer.id = DIMENSION_ASSOC_LAYER_ID;
  layer.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:9999;";
  document.body.appendChild(layer);
  return layer;
}

function clearDimensionAssociationLayer() {
  const layer = document.getElementById(DIMENSION_ASSOC_LAYER_ID);
  if (layer?.parentNode) layer.parentNode.removeChild(layer);
}

function graphToClient(canvas, x, y) {
  if (!canvas?.canvas) return null;
  const rect = canvas.canvas.getBoundingClientRect();
  const scale = getCanvasScale(canvas);
  const offset = canvas.ds?.offset || [0, 0];
  return {
    x: rect.left + (x + (Number(offset[0]) || 0)) * scale,
    y: rect.top + (y + (Number(offset[1]) || 0)) * scale,
  };
}

function renderDimensionAssociationHighlights(canvas, status) {
  const layer = ensureDimensionAssociationLayer();
  if (!layer) return;
  while (layer.firstChild) layer.removeChild(layer.firstChild);
  if (!canvas || !status?.active) return;
  if (!getHighlightEnabled()) return;

  const scale = getCanvasScale(canvas);
  const borderW = 2;
  const guideColor = getHighlightColor();

  function appendLine(x, y, w, h, color) {
    const line = document.createElement("div");
    line.style.cssText = `position:fixed;left:${Math.round(x)}px;top:${Math.round(y)}px;width:${Math.max(0, Math.round(w))}px;height:${Math.max(0, Math.round(h))}px;border:${borderW}px dotted ${color};box-sizing:border-box;opacity:0.95;`;
    layer.appendChild(line);
  }

  const nodeMap = {};
  function trackNode(node, axis) {
    if (!node?.id) return;
    const key = String(node.id);
    if (!nodeMap[key]) nodeMap[key] = { node, width: false, height: false };
    nodeMap[key][axis] = true;
  }

  const xNodes = status.xDidSnap ? (status.xWinnerNodes || []) : [];
  const yNodes = status.yDidSnap ? (status.yWinnerNodes || []) : [];
  for (const n of xNodes) trackNode(n, "width");
  for (const n of yNodes) trackNode(n, "height");

  const titleH = Number(window.LiteGraph?.NODE_TITLE_HEIGHT) || 24;

  for (const key in nodeMap) {
    if (!Object.prototype.hasOwnProperty.call(nodeMap, key)) continue;
    const item = nodeMap[key];
    const bounds = getNodeBounds(item.node);
    if (!bounds) continue;

    // For vertical guides (left/right), use full bounds
    const topLeftFull = graphToClient(canvas, bounds.left, bounds.top);
    if (!topLeftFull) continue;
    const left = topLeftFull.x;
    const width = Math.max(0, (bounds.right - bounds.left) * scale);
    const fullHeight = Math.max(0, (bounds.bottom - bounds.top) * scale);

    // For horizontal guides (top/bottom), offset by title height to align with content edges
    const contentTopY = bounds.top - titleH;
    const contentBottomY = bounds.bottom - titleH;
    const contentTop = graphToClient(canvas, bounds.left, contentTopY).y;
    const contentBottom = graphToClient(canvas, bounds.left, contentBottomY).y;
    const contentHeight = contentBottom - contentTop;

    if (item.width) {
      if (status.axis === "move") {
        // For move snapping, show guide on the target edge closest to active node
        const activeCenterX = status.activeCenterX ?? bounds.left;
        const targetCenterX = bounds.left + (bounds.right - bounds.left) / 2;
        
        // Active node is to the left of target center -> show target's LEFT edge
        // Active node is to the right of target center -> show target's RIGHT edge
        const anchorCanvasX = activeCenterX < targetCenterX ? bounds.left : bounds.right;
        
        let lineXClient = graphToClient(canvas, anchorCanvasX, bounds.top).x;
        if (anchorCanvasX === bounds.right) lineXClient -= borderW;
        appendLine(lineXClient, contentTop, borderW, contentHeight, guideColor);
      } else {
        appendLine(left, contentTop, borderW, contentHeight, guideColor);
        appendLine(left + width - borderW, contentTop, borderW, contentHeight, guideColor);
      }
    }
    if (item.height) {
      if (status.axis === "move") {
        // For move snapping, show guide on the target edge closest to active node
        const activeCenterY = status.activeCenterY ?? bounds.top;
        const targetCenterY = bounds.top + (bounds.bottom - bounds.top) / 2;
        
        // Active node is above target center -> show target's TOP edge
        // Active node is below target center -> show target's BOTTOM edge
        const anchorCanvasY = activeCenterY < targetCenterY ? contentTop : contentBottom;
        
        appendLine(left, anchorCanvasY, width, borderW, guideColor);
      } else {
        // For resize, show both edges
        // Top edge guide - at content top (below title bar)
        appendLine(left, contentTop, width, borderW, guideColor);
        // Bottom edge guide - exactly at node bottom edge
        appendLine(left, contentBottom, width, borderW, guideColor);
      }
    }
  }
}

function renderResizeDebugHud(canvas) {
  const s = canvas?.__blockSpaceResizeDebugStatus;
  if (!s?.active) {
    clearDimensionAssociationLayer();
    return;
  }
  renderDimensionAssociationHighlights(canvas, s);
}

function ensureSnapFeedbackState(canvas) {
  if (!canvas) return null;
  if (!canvas.__blockSpaceSnapFeedbackState) canvas.__blockSpaceSnapFeedbackState = { pulses: {} };
  return canvas.__blockSpaceSnapFeedbackState;
}

function buildSnapFeedbackPayload(xDidSnap, yDidSnap) {
  if (!xDidSnap && !yDidSnap) return null;
  if (xDidSnap && yDidSnap) return { axisLabel: "XY", color: getFeedbackColorXY() };
  if (xDidSnap) return { axisLabel: "X", color: getFeedbackColorX() };
  return { axisLabel: "Y", color: getFeedbackColorY() };
}

function triggerSnapFeedback(canvas, node, xDidSnap, yDidSnap) {
  if (!canvas || !node || !getFeedbackEnabled()) return;
  const payload = buildSnapFeedbackPayload(!!xDidSnap, !!yDidSnap);
  if (!payload) return;
  const state = ensureSnapFeedbackState(canvas);
  if (!state) return;
  const now = Date.now();
  const nodeId = node.id != null ? String(node.id) : null;
  if (!nodeId) return;

  const pulseMs = getFeedbackPulseMs();
  let pulse = state.pulses[nodeId];
  if (!pulse) {
    pulse = { node, hadBoxcolor: Object.prototype.hasOwnProperty.call(node, "boxcolor"), boxcolor: node.boxcolor, expiresAt: now + pulseMs };
    state.pulses[nodeId] = pulse;
  } else {
    pulse.node = node;
    pulse.expiresAt = now + pulseMs;
  }
  pulse.color = payload.color;
  node.boxcolor = payload.color;
  canvas.dirty_canvas = true;
  canvas.dirty_bgcanvas = true;
}

function clearSnapFeedbackState(canvas) {
  if (!canvas?.__blockSpaceSnapFeedbackState) return;
  const state = canvas.__blockSpaceSnapFeedbackState;
  const pulses = state.pulses || {};
  for (const key in pulses) {
    const pulse = pulses[key];
    if (!pulse?.node) continue;
    if (pulse.hadBoxcolor) pulse.node.boxcolor = pulse.boxcolor;
    else delete pulse.node.boxcolor;
  }
  canvas.__blockSpaceSnapFeedbackState = { pulses: {} };
  canvas.dirty_canvas = true;
  canvas.dirty_bgcanvas = true;
}

function updateSnapFeedback(canvas) {
  if (!canvas) return;
  if (!getFeedbackEnabled()) {
    clearSnapFeedbackState(canvas);
    return;
  }
  const state = ensureSnapFeedbackState(canvas);
  if (!state) return;
  const now = Date.now();
  const pulses = state.pulses || {};
  for (const key in pulses) {
    const pulse = pulses[key];
    if (!pulse?.node || !getNodeBounds(pulse.node)) {
      delete pulses[key];
      continue;
    }
    if (now <= pulse.expiresAt) pulse.node.boxcolor = pulse.color;
    else {
      if (pulse.hadBoxcolor) pulse.node.boxcolor = pulse.boxcolor;
      else delete pulse.node.boxcolor;
      delete pulses[key];
    }
  }
}

// ============================================================================
// Connection Focus Functions
// ============================================================================

const focusState = {
  activeCanvas: null,
  activeNodeId: null,
  isHolding: false,
  rafId: 0,
  animationTime: 0,
};

const defaultFocusSettings = {
  pulseColor: "#ff00ae",
  connectorStubLength: 34,
  connectorStyle: "hybrid",
  enabled: true,
};

function getFocusSettings() {
  if (!window.ConnectionFocusSettings || typeof window.ConnectionFocusSettings !== "object") {
    window.ConnectionFocusSettings = {};
  }
  const settings = window.ConnectionFocusSettings;
  if (typeof settings.pulseColor !== "string" || !settings.pulseColor.trim()) {
    settings.pulseColor = defaultFocusSettings.pulseColor;
  }
  if (typeof settings.connectorStubLength !== "number" || !isFinite(settings.connectorStubLength)) {
    settings.connectorStubLength = defaultFocusSettings.connectorStubLength;
  }
  settings.connectorStubLength = Math.max(10, Math.min(80, settings.connectorStubLength));
  const style = settings.connectorStyle;
  if (style !== "straight" && style !== "hybrid" && style !== "angled") {
    settings.connectorStyle = defaultFocusSettings.connectorStyle;
  }
  if (typeof settings.enabled !== "boolean") {
    settings.enabled = defaultFocusSettings.enabled;
  }
  return settings;
}

function markCanvasDirty(canvas) {
  if (canvas?.setDirty) canvas.setDirty(true, true);
}

function stopAnimationLoop() {
  if (focusState.rafId) {
    window.cancelAnimationFrame(focusState.rafId);
    focusState.rafId = 0;
  }
}

function animationTick() {
  if (!focusState.isHolding || !focusState.activeCanvas || focusState.activeNodeId == null) {
    stopAnimationLoop();
    return;
  }
  focusState.animationTime = window.performance ? window.performance.now() : Date.now();
  markCanvasDirty(focusState.activeCanvas);
  focusState.rafId = window.requestAnimationFrame(animationTick);
}

function startAnimationLoop() {
  if (focusState.rafId) return;
  focusState.rafId = window.requestAnimationFrame(animationTick);
}

function clearFocusState() {
  const canvas = focusState.activeCanvas;
  focusState.activeCanvas = null;
  focusState.activeNodeId = null;
  focusState.isHolding = false;
  stopAnimationLoop();
  markCanvasDirty(canvas);
}

function setFocusState(canvas, nodeId) {
  focusState.activeCanvas = canvas || null;
  focusState.activeNodeId = nodeId;
  focusState.isHolding = !!canvas && nodeId != null;
  if (focusState.isHolding) {
    startAnimationLoop();
    markCanvasDirty(canvas);
  } else {
    clearFocusState();
  }
}

function isLeftPointer(event) {
  if (!event) return false;
  if (event.isPrimary === false) return false;
  if (event.button === 0) return true;
  if (typeof event.which === "number") return event.which === 1;
  if (typeof event.buttons === "number") return (event.buttons & 1) === 1;
  if (typeof event.type === "string" && (event.type === "mousedown" || event.type === "pointerdown")) return true;
  return false;
}

function getNodeAtEvent(canvas, event) {
  if (!canvas?.graph?.getNodeOnPos || !event) return null;
  if (typeof canvas.adjustMouseEvent === "function") canvas.adjustMouseEvent(event);
  if (typeof event.canvasX !== "number" || typeof event.canvasY !== "number") return null;
  return canvas.graph.getNodeOnPos(event.canvasX, event.canvasY) || null;
}

function extractLinkInfo(argsLike) {
  for (let i = 0; i < argsLike.length; i++) {
    const candidate = argsLike[i];
    if (candidate && typeof candidate === "object" && "origin_id" in candidate && "target_id" in candidate) {
      return candidate;
    }
  }
  return null;
}

function addLinkLaneOffsets(links, byKey) {
  if (!Array.isArray(links) || !links.length || !byKey) return;
  links.sort((a, b) => {
    const aNode = a.peerNodeId != null ? Number(a.peerNodeId) : 0;
    const bNode = b.peerNodeId != null ? Number(b.peerNodeId) : 0;
    if (aNode !== bNode) return aNode - bNode;
    const aSlot = a.peerSlot != null ? Number(a.peerSlot) : 0;
    const bSlot = b.peerSlot != null ? Number(b.peerSlot) : 0;
    if (aSlot !== bSlot) return aSlot - bSlot;
    return String(a.key).localeCompare(String(b.key));
  });

  const center = (links.length - 1) * 0.5;
  for (let i = 0; i < links.length; i++) {
    byKey[String(links[i].key)] = (i - center) * CONNECTOR_FAN_SPACING;
  }
}

function getActiveFocus(canvas) {
  if (!focusState.isHolding || !canvas || focusState.activeCanvas !== canvas || focusState.activeNodeId == null) return null;
  if (!canvas.graph?.getNodeById) return null;

  const graph = canvas.graph;
  const activeNode = graph.getNodeById(focusState.activeNodeId);
  if (!activeNode) return null;

  const connectedNodeIds = {}, connectedLinkIds = {}, targetInputsByNode = {}, sourceOutputSlotsByNode = {};
  const activeOutputSlots = {}, activeInputSlots = {}, outgoingGroups = {}, incomingGroups = {}, linkLaneOffsets = {};

  if (graph.links) {
    for (const linkId in graph.links) {
      if (!Object.prototype.hasOwnProperty.call(graph.links, linkId)) continue;
      const link = graph.links[linkId];
      if (!link) continue;
      const linkKey = link.id != null ? link.id : linkId;

      if (link.origin_id === activeNode.id) {
        connectedNodeIds[link.target_id] = true;
        connectedLinkIds[linkKey] = true;
        activeOutputSlots[link.origin_slot] = true;
        if (!targetInputsByNode[link.target_id]) targetInputsByNode[link.target_id] = {};
        targetInputsByNode[link.target_id][link.target_slot] = true;
        const outGroupKey = String(link.origin_slot);
        if (!outgoingGroups[outGroupKey]) outgoingGroups[outGroupKey] = [];
        outgoingGroups[outGroupKey].push({ key: linkKey, peerNodeId: link.target_id, peerSlot: link.target_slot });
      }

      if (link.target_id === activeNode.id) {
        connectedNodeIds[link.origin_id] = true;
        connectedLinkIds[linkKey] = true;
        activeInputSlots[link.target_slot] = true;
        if (!sourceOutputSlotsByNode[link.origin_id]) sourceOutputSlotsByNode[link.origin_id] = {};
        sourceOutputSlotsByNode[link.origin_id][link.origin_slot] = true;
        const inGroupKey = String(link.target_slot);
        if (!incomingGroups[inGroupKey]) incomingGroups[inGroupKey] = [];
        incomingGroups[inGroupKey].push({ key: linkKey, peerNodeId: link.origin_id, peerSlot: link.origin_slot });
      }
    }
  }

  for (const outKey in outgoingGroups) {
    if (Object.prototype.hasOwnProperty.call(outgoingGroups, outKey)) {
      addLinkLaneOffsets(outgoingGroups[outKey], linkLaneOffsets);
    }
  }
  for (const inKey in incomingGroups) {
    if (Object.prototype.hasOwnProperty.call(incomingGroups, inKey)) {
      addLinkLaneOffsets(incomingGroups[inKey], linkLaneOffsets);
    }
  }

  return {
    activeNodeId: activeNode.id, connectedNodeIds, connectedLinkIds, targetInputsByNode,
    sourceOutputSlotsByNode, activeOutputSlots, activeInputSlots, linkLaneOffsets,
    animationTime: focusState.animationTime,
  };
}

function getSlotColor(node, isInput, slotIndex) {
  if (!node) return null;
  const slots = isInput ? node.inputs : node.outputs;
  if (slots?.[slotIndex]) {
    const slot = slots[slotIndex];
    if (typeof slot.color === "string" && slot.color) return slot.color;
    if (slot.type && typeof slot.type === "string") {
      const slotType = slot.type;
      const lg = window.LiteGraph;
      if (lg?.type_colors?.[slotType]) return lg.type_colors[slotType];
      const constName = slotType.toUpperCase() + "_COLOR";
      if (lg?.[constName]) return lg[constName];
      const typeMap = {
        "MODEL": "#B39DDB", "CLIP": "#FFD166", "VAE": "#FF6B6B", "LATENT": "#FF6B9D",
        "IMAGE": "#4ECDC4", "MASK": "#95E1D3", "CONDITIONING": "#FFA07A",
        "FLOAT": "#AAEE88", "INT": "#AAEE88", "STRING": "#F7DC6F", "BOOLEAN": "#87CEEB",
      };
      if (typeMap[slotType]) return typeMap[slotType];
    }
  }
  return null;
}

function drawFlowOverlay(canvas, argsLike, animationTime, sourceOffset, targetOffset) {
  if (!canvas || !argsLike?.length) return;
  const ctx = argsLike[0];
  if (!ctx?.setLineDash) return;
  const a = argsLike[1], b = argsLike[2];
  if (!a || !b || a.length < 2 || b.length < 2) return;

  const ax = a[0], ay = a[1], bx = b[0], by = b[1];
  const settings = getFocusSettings();
  const dashOffset = -((animationTime || 0) * 0.028);
  const prevLineWidth = ctx.lineWidth || 1;
  const stub = settings.connectorStubLength;

  ctx.save();
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = Math.max(1.2, prevLineWidth + 0.4);
  ctx.strokeStyle = "#ffffff";
  ctx.setLineDash([6, 10]);
  ctx.lineDashOffset = dashOffset;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  drawConfiguredPath(ctx, ax, ay, bx, by, stub, settings.connectorStyle, sourceOffset || 0, targetOffset || 0);
  ctx.stroke();
  ctx.restore();
}

function drawSlotRing(node, ctx, isInput, slotIndex, color) {
  if (!node || !ctx || slotIndex < 0) return;
  const pos = node.getConnectionPos(!!isInput, slotIndex, [0, 0]);
  if (!pos?.length >= 2) return;
  const x = pos[0] - node.pos[0];
  const y = pos[1] - node.pos[1];

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.globalAlpha = 0.95;
  ctx.beginPath();
  ctx.arc(x, y, 6.2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.arc(x, y, 4.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHardAngleLink(argsLike, sourceOffset, targetOffset, color) {
  if (!argsLike?.length) return;
  const ctx = argsLike[0];
  if (!ctx) return;
  const a = argsLike[1], b = argsLike[2];
  if (!a || !b || a.length < 2 || b.length < 2) return;

  const settings = getFocusSettings();
  ctx.save();
  if (color) ctx.strokeStyle = color;
  ctx.lineJoin = "miter";
  ctx.lineCap = "round";
  drawConfiguredPath(ctx, a[0], a[1], b[0], b[1], settings.connectorStubLength, settings.connectorStyle, sourceOffset || 0, targetOffset || 0);
  ctx.stroke();
  ctx.restore();
}

function drawConfiguredPath(ctx, ax, ay, bx, by, stub, style, sourceOffset, targetOffset) {
  const so = Number(sourceOffset) || 0;
  const to = Number(targetOffset) || 0;
  if (style === "straight") {
    drawStraightPath(ctx, ax, ay, bx, by, stub, so, to);
  } else if (style === "angled") {
    drawAngledPath(ctx, ax, ay, bx, by, stub, so, to);
  } else {
    drawHybridPath(ctx, ax, ay, bx, by, stub);
  }
}

function drawStraightPath(ctx, ax, ay, bx, by, stub, sourceOffset, targetOffset) {
  const sourceY = ay + (Number(sourceOffset) || 0);
  const targetY = by + (Number(targetOffset) || 0);
  const startX = ax + stub;
  const endX = bx - stub;
  const needsDetour = endX <= startX + 8;
  const laneX = Math.max(startX, endX) + stub;
  const midX = (startX + endX) * 0.5;

  ctx.beginPath();
  ctx.moveTo(ax, ay);
  if (sourceY !== ay) ctx.lineTo(ax, sourceY);
  ctx.lineTo(startX, sourceY);
  if (needsDetour) {
    ctx.lineTo(laneX, sourceY);
    ctx.lineTo(laneX, targetY);
  } else {
    ctx.lineTo(midX, sourceY);
    ctx.lineTo(midX, targetY);
  }
  ctx.lineTo(endX, targetY);
  ctx.lineTo(bx, targetY);
  if (targetY !== by) ctx.lineTo(bx, by);
}

function drawAngledPath(ctx, ax, ay, bx, by, stub, sourceOffset, targetOffset) {
  const sourceY = ay + (Number(sourceOffset) || 0);
  const targetY = by + (Number(targetOffset) || 0);
  const startX = ax + stub;
  const endX = bx - stub;
  const needsDetour = endX <= startX + 8;
  const laneX = Math.max(startX, endX) + stub;

  ctx.beginPath();
  ctx.moveTo(ax, ay);
  if (sourceY !== ay) ctx.lineTo(ax, sourceY);
  ctx.lineTo(startX, sourceY);
  if (needsDetour) {
    ctx.lineTo(laneX, sourceY);
    ctx.lineTo(laneX, targetY);
    ctx.lineTo(endX, targetY);
  } else {
    ctx.lineTo(endX, targetY);
  }
  ctx.lineTo(bx, targetY);
  if (targetY !== by) ctx.lineTo(bx, by);
}

function drawHybridPath(ctx, ax, ay, bx, by, stub) {
  const startX = ax + stub;
  const endX = bx - stub;
  const needsDetour = endX <= startX + 8;
  const laneX = Math.max(startX, endX) + stub;
  const dx = Math.max(20, Math.min(140, Math.abs(endX - startX) * 0.5));

  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(startX, ay);
  if (needsDetour) {
    ctx.bezierCurveTo(laneX, ay, laneX, by, endX, by);
  } else {
    ctx.bezierCurveTo(startX + dx, ay, endX - dx, by, endX, by);
  }
  ctx.lineTo(bx, by);
}

// ============================================================================
// Smart Drop Functions
// ============================================================================

let activeMenuCleanup = null;

function splitTypes(typeValue) {
  if (typeValue == null || typeValue === "") return [];
  if (Array.isArray(typeValue)) {
    return typeValue.map(v => String(v).trim().toUpperCase()).filter(Boolean);
  }
  return String(typeValue).split(/[|,]/).map(v => v.trim().toUpperCase()).filter(Boolean);
}

function isWildcardType(typeValue) {
  if (typeValue == null || typeValue === "") return true;
  if (Array.isArray(typeValue)) return typeValue.length === 0 || typeValue.includes("*");
  return String(typeValue).trim() === "*";
}

function areTypesCompatible(originType, inputType) {
  if (isWildcardType(originType) || isWildcardType(inputType)) return true;
  const originTypes = splitTypes(originType);
  const inputTypes = splitTypes(inputType);
  return originTypes.some(t => inputTypes.includes(t));
}

function captureOriginDragState(canvas) {
  if (!canvas?.connecting_node) return null;
  const originNode = canvas.connecting_node;
  let originSlotIndex = -1;

  if (typeof canvas.connecting_slot === "number") originSlotIndex = canvas.connecting_slot;
  else if (typeof canvas.connecting_output === "number") originSlotIndex = canvas.connecting_output;
  else if (originNode.outputs && canvas.connecting_output) originSlotIndex = originNode.outputs.indexOf(canvas.connecting_output);

  if (originSlotIndex < 0 || !originNode.outputs?.[originSlotIndex]) return null;

  const originOutput = originNode.outputs[originSlotIndex];
  return {
    originNode,
    originSlotIndex,
    originOutput,
    linkCountBefore: Array.isArray(originOutput.links) ? originOutput.links.length : 0,
  };
}

function destroyActiveMenu() {
  if (typeof activeMenuCleanup === "function") {
    activeMenuCleanup();
    activeMenuCleanup = null;
  }
}

function createAmbiguityMenu(params) {
  destroyActiveMenu();
  const { clientX, clientY, matches, originNode, originSlotIndex, targetNode, canvasElement } = params;

  const menu = document.createElement("div");
  menu.className = "smart-drop-menu";
  menu.style.cssText = `position:fixed;left:${clientX + 8}px;top:${clientY + 8}px;z-index:9999;min-width:180px;background:#20232a;color:#f2f2f2;border:1px solid #4a4f59;border-radius:8px;box-shadow:0 8px 20px rgba(0,0,0,0.35);padding:6px;font-family:Arial,sans-serif;font-size:13px;`;

  const title = document.createElement("div");
  title.textContent = "Select input";
  title.style.cssText = "padding:6px 8px;opacity:0.85;border-bottom:1px solid #3b4048;margin-bottom:4px;";
  menu.appendChild(title);

  for (const match of matches) {
    const item = document.createElement("button");
    item.type = "button";
    item.textContent = match.inputName;
    item.style.cssText = "display:block;width:100%;text-align:left;border:0;border-radius:5px;padding:7px 8px;background:transparent;color:#f2f2f2;cursor:pointer;";
    item.addEventListener("mouseenter", () => item.style.background = "#2f3541");
    item.addEventListener("mouseleave", () => item.style.background = "transparent");
    item.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      originNode.connect(originSlotIndex, targetNode, match.inputIndex);
      destroyActiveMenu();
    });
    menu.appendChild(item);
  }

  document.body.appendChild(menu);

  function dismissOnOutsidePointer(e) {
    if (!menu.contains(e.target)) destroyActiveMenu();
  }
  function dismissOnEscape(e) {
    if (e.key === "Escape") destroyActiveMenu();
  }

  setTimeout(() => {
    document.addEventListener("pointerdown", dismissOnOutsidePointer, true);
    document.addEventListener("keydown", dismissOnEscape, true);
    canvasElement?.addEventListener("pointerdown", dismissOnOutsidePointer, true);
  }, 0);

  function removeOutsideListeners() {
    document.removeEventListener("pointerdown", dismissOnOutsidePointer, true);
    document.removeEventListener("keydown", dismissOnEscape, true);
    canvasElement?.removeEventListener("pointerdown", dismissOnOutsidePointer, true);
  }

  function cleanupMenu() {
    removeOutsideListeners();
    if (menu.parentNode) menu.parentNode.removeChild(menu);
    if (activeMenuCleanup === cleanupMenu) activeMenuCleanup = null;
  }
  activeMenuCleanup = cleanupMenu;
}

// ============================================================================
// Smart Sizing Functions
// ============================================================================

const MIN_NODE_WIDTH = 150;
const MAX_TEXT_WIDTH = 250;
const PORT_PADDING = 40;

let measureCanvas = null;
let measureCtx = null;

function getMeasureCtx() {
  if (!measureCanvas) {
    measureCanvas = document.createElement("canvas");
    measureCtx = measureCanvas.getContext("2d");
  }
  return measureCtx;
}

function getNodeFont() {
  return ((window.LiteGraph?.NODE_TEXT_SIZE) || 14) + "px Arial";
}

function measureTextWidth(text) {
  const ctx = getMeasureCtx();
  if (!ctx || !text) return 0;
  ctx.font = getNodeFont();
  return ctx.measureText(String(text)).width;
}

function truncateToWidth(text, maxWidth) {
  if (text == null) return "";
  const value = String(text);
  if (!value || measureTextWidth(value) <= maxWidth) return value;
  const ellipsis = "...";
  const ellipsisWidth = measureTextWidth(ellipsis);
  if (ellipsisWidth >= maxWidth) return ellipsis;

  let left = 0, right = value.length;
  while (left < right) {
    const mid = Math.ceil((left + right) / 2);
    if (measureTextWidth(value.slice(0, mid) + ellipsis) <= maxWidth) left = mid;
    else right = mid - 1;
  }
  return value.slice(0, left) + ellipsis;
}

function getSlotText(slot) {
  return slot?.label != null ? slot.label : slot?.name || "";
}

function getSlotMaxWidth(slots) {
  if (!Array.isArray(slots) || !slots.length) return 0;
  let maxWidth = 0;
  for (const slot of slots) {
    const text = truncateToWidth(getSlotText(slot), MAX_TEXT_WIDTH);
    maxWidth = Math.max(maxWidth, Math.min(MAX_TEXT_WIDTH, measureTextWidth(text)));
  }
  return maxWidth;
}

function getWidgetSize(widget, currentWidth) {
  if (!widget) return [0, 0];
  let size = null;
  if (typeof widget.computeSize === "function") {
    try { size = widget.computeSize(currentWidth); } catch (e) {}
  }
  if (!size || size.length < 2) {
    const options = widget.options || {};
    size = [
      widget.width || options.width || options.w || 0,
      widget.height || options.height || options.h || window.LiteGraph?.NODE_WIDGET_HEIGHT || 20
    ];
  }
  return [Math.max(0, Number(size[0]) || 0), Math.max(0, Number(size[1]) || 0)];
}

function computeWidgetBounds(node, startWidth) {
  if (!Array.isArray(node.widgets) || !node.widgets.length) return { width: 0, height: 0 };
  let maxWidth = 0, totalHeight = 0;
  for (const widget of node.widgets) {
    const size = getWidgetSize(widget, startWidth);
    maxWidth = Math.max(maxWidth, size[0]);
    totalHeight += size[1] + 4;
  }
  return { width: maxWidth, height: totalHeight + 8 };
}

function applyTruncatedLabelsTemporarily(node) {
  const restorations = [];
  if (!node) return restorations;

  function storeAndAssign(target, key, value) {
    restorations.push({ target, key, hadOwn: Object.prototype.hasOwnProperty.call(target, key), previous: target[key] });
    target[key] = value;
  }

  storeAndAssign(node, "title", truncateToWidth(node.title || "", MAX_TEXT_WIDTH));

  const slots = [...(node.inputs || []), ...(node.outputs || [])];
  for (const slot of slots) {
    if (!slot) continue;
    const truncated = truncateToWidth(getSlotText(slot), MAX_TEXT_WIDTH);
    storeAndAssign(slot, "label", truncated);
    slot.__smartDisplayLabel = truncated;
  }

  return restorations;
}

function restoreTemporaryValues(restorations) {
  if (!restorations?.length) return;
  for (let i = restorations.length - 1; i >= 0; i--) {
    const item = restorations[i];
    if (!item.hadOwn) delete item.target[item.key];
    else item.target[item.key] = item.previous;
  }
}

// ============================================================================
// Node Arrangement Functions
// ============================================================================

let arrangementPanel = null;
const ARRANGEMENT_STORAGE_KEY = "block-space-arrangement-panel-pos";

function arrangeSelection(canvas, mode) {
  const selected = canvas.selected_nodes;
  if (!selected) return;

  const nodes = Object.values(selected).filter(n => n?.pos);
  if (nodes.length < 2) return;

  canvas.graph?.beforeChange?.();

  const hMargin = getHSnapMargin();
  const vMargin = getVSnapMargin();
  const titleH = Number(window.LiteGraph?.NODE_TITLE_HEIGHT) || 24;

  nodes.sort((a, b) => Math.abs(a.pos[1] - b.pos[1]) > 5 ? a.pos[1] - b.pos[1] : a.pos[0] - b.pos[0]);
  const anchor = nodes[0];
  const startX = anchor.pos[0];
  const startY = anchor.pos[1];

  if (mode === "grid") {
    const columns = [];
    const sortedByX = [...nodes].sort((a, b) => a.pos[0] - b.pos[0]);

    for (const node of sortedByX) {
      let placed = false;
      for (const col of columns) {
        const avgX = col.reduce((sum, n) => sum + n.pos[0], 0) / col.length;
        if (Math.abs(node.pos[0] - avgX) < 150) {
          col.push(node);
          placed = true;
          break;
        }
      }
      if (!placed) columns.push([node]);
    }

    columns.forEach(col => col.sort((a, b) => a.pos[1] - b.pos[1]));
    columns.sort((a, b) => a[0].pos[0] - b[0].pos[0]);

    const colWidths = columns.map(col => Math.max(...col.map(n => {
      const b = getNodeBounds(n);
      return b ? b.right - b.left : 0;
    })));

    const colHeights = columns.map(col => {
      const sum = col.reduce((s, n) => {
        const b = getNodeBounds(n);
        return s + (b ? b.bottom - b.top : 0);
      }, 0);
      return sum + (col.length - 1) * vMargin;
    });

    const targetTotalHeight = Math.max(...colHeights);
    let currentX = startX;

    for (let c = 0; c < columns.length; c++) {
      const col = columns[c];
      let currentY = startY;
      const extraHeightNeeded = targetTotalHeight - colHeights[c];
      const heightBonusPerNode = extraHeightNeeded / col.length;

      for (const node of col) {
        const bounds = getNodeBounds(node);
        node.pos[0] = Math.round(currentX);
        node.pos[1] = Math.round(currentY);
        const newContentHeight = Math.max(node.size[1], (bounds ? bounds.bottom - bounds.top : 0) + heightBonusPerNode - titleH);
        node.size[1] = Math.round(newContentHeight);
        node.size[0] = Math.round(colWidths[c]);
        currentY += newContentHeight + titleH + vMargin;
      }
      currentX += colWidths[c] + hMargin;
    }
  } else {
    for (let i = 1; i < nodes.length; i++) {
      const prev = nodes[i - 1];
      const node = nodes[i];
      const prevBounds = getNodeBounds(prev);
      if (mode === "y") {
        node.pos[0] = Math.round(anchor.pos[0]);
        node.pos[1] = Math.round(prevBounds.bottom + vMargin);
      } else {
        node.pos[1] = Math.round(anchor.pos[1]);
        node.pos[0] = Math.round(prevBounds.right + hMargin);
      }
    }
  }

  canvas.graph?.afterChange?.();
  canvas.dirty_canvas = true;
  canvas.dirty_bgcanvas = true;
}

function createArrangementPanel() {
  if (arrangementPanel) return arrangementPanel;

  const existing = document.getElementById("block-space-arrangement-panel");
  if (existing) {
    arrangementPanel = existing;
    return arrangementPanel;
  }

  arrangementPanel = document.createElement("div");
  arrangementPanel.id = "block-space-arrangement-panel";
  arrangementPanel.style.cssText = "position:fixed;background:rgba(30,30,30,0.95);border:1px solid #444;border-radius:8px;padding:8px 12px;display:none;flex-direction:row;gap:10px;align-items:center;box-shadow:0 4px 15px rgba(0,0,0,0.5);z-index:10000;transition:opacity 0.2s,transform 0.2s;pointer-events:auto;";

  const savedPos = localStorage.getItem(ARRANGEMENT_STORAGE_KEY);
  if (savedPos) {
    try {
      const pos = JSON.parse(savedPos);
      arrangementPanel.style.left = pos.x + "px";
      arrangementPanel.style.top = pos.y + "px";
      arrangementPanel.style.transform = "none";
    } catch(e) {
      arrangementPanel.style.cssText += "top:20px;left:50%;transform:translateX(-50%);";
    }
  } else {
    arrangementPanel.style.cssText += "top:20px;left:50%;transform:translateX(-50%);";
  }

  const handle = document.createElement("div");
  handle.style.cssText = "display:flex;align-items:center;cursor:grab;user-select:none;margin-right:8px;padding-right:8px;border-right:1px solid #444;";
  handle.innerHTML = `<span style="color:#666;font-size:14px;margin-right:6px;font-family:monospace;">⠿</span>
    <svg viewBox="0 0 24 24" style="width:16px;height:16px;margin-right:8px;vertical-align:middle;">
      <path d="M4 4H10V10H4V4Z" fill="#57b1ff"/><path d="M14 14H20V20H14V14Z" fill="#8dff57"/>
      <path d="M14 4H20V10H14V4Z" fill="none" stroke="#57b1ff" stroke-width="2"/>
      <path d="M4 14H10V20H4V14Z" fill="none" stroke="#8dff57" stroke-width="2"/>
      <line x1="10" y1="10" x2="14" y2="14" stroke="#b57cff" stroke-width="2" stroke-linecap="round" stroke-dasharray="2 3"/>
    </svg>
    <span style="color:#888;font-size:11px;font-weight:bold;white-space:nowrap;">Block Space</span>`;
  arrangementPanel.appendChild(handle);

  let isDragging = false, offsetX, offsetY;
  handle.onmousedown = (e) => {
    isDragging = true;
    handle.style.cursor = "grabbing";
    const rect = arrangementPanel.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    arrangementPanel.style.transition = "none";
    e.preventDefault();
  };

  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    arrangementPanel.style.left = (e.clientX - offsetX) + "px";
    arrangementPanel.style.top = (e.clientY - offsetY) + "px";
    arrangementPanel.style.transform = "none";
  });

  window.addEventListener("mouseup", () => {
    if (!isDragging) return;
    isDragging = false;
    handle.style.cursor = "grab";
    arrangementPanel.style.transition = "opacity 0.2s,transform 0.2s";
    const rect = arrangementPanel.getBoundingClientRect();
    localStorage.setItem(ARRANGEMENT_STORAGE_KEY, JSON.stringify({ x: rect.left, y: rect.top }));
  });

  function createBtn(text, icon, callback) {
    const btn = document.createElement("button");
    btn.innerHTML = `<span style="margin-right:6px">${icon}</span>${text}`;
    btn.style.cssText = "background:#333;color:#eee;border:1px solid #555;border-radius:4px;padding:6px 12px;cursor:pointer;font-size:12px;display:flex;align-items:center;transition:background 0.1s,border-color 0.1s;";
    btn.onmouseenter = () => { btn.style.background = "#444"; btn.style.borderColor = "#777"; };
    btn.onmouseleave = () => { btn.style.background = "#333"; btn.style.borderColor = "#555"; };
    btn.onclick = callback;
    return btn;
  }

  arrangementPanel.appendChild(createBtn("Stack", "↕️", () => window.app?.canvas && arrangeSelection(window.app.canvas, "y")));
  arrangementPanel.appendChild(createBtn("Flow", "↔️", () => window.app?.canvas && arrangeSelection(window.app.canvas, "x")));
  arrangementPanel.appendChild(createBtn("Harmonize", "💎", () => window.app?.canvas && arrangeSelection(window.app.canvas, "grid")));

  document.body.appendChild(arrangementPanel);
  return arrangementPanel;
}

function updatePanelVisibility() {
  const canvas = window.app?.canvas;
  if (!canvas) return;

  const selectedCount = canvas.selected_nodes ? Object.keys(canvas.selected_nodes).length : 0;
  const p = createArrangementPanel();

  if (selectedCount > 1) {
    if (p.style.display === "none") {
      p.style.display = "flex";
      p.style.opacity = "0";
      if (!localStorage.getItem(ARRANGEMENT_STORAGE_KEY)) {
        p.style.transform = "translateX(-50%) translateY(-10px)";
        setTimeout(() => { p.style.opacity = "1"; p.style.transform = "translateX(-50%) translateY(0)"; }, 10);
      } else {
        setTimeout(() => p.style.opacity = "1", 10);
      }
    }
  } else {
    if (p.style.display === "flex") {
      p.style.opacity = "0";
      if (!localStorage.getItem(ARRANGEMENT_STORAGE_KEY)) p.style.transform = "translateX(-50%) translateY(-10px)";
      setTimeout(() => p.style.display = "none", 200);
    }
  }
}

// ============================================================================
// Patch Initialization Functions
// ============================================================================

function initNodeSnappingPatches() {
  if (!window.LGraphCanvas?.prototype || window.LGraphCanvas.prototype.__blockSpaceNodeSnapPatched) return;

  V1State.originalProcessMouseMove = window.LGraphCanvas.prototype.processMouseMove;

  window.LGraphCanvas.prototype.processMouseMove = function(event) {
    if (!this.__blockSpaceResetPersistedHighlightDone) {
      resetPersistedHighlightArtifacts(this);
      this.__blockSpaceResetPersistedHighlightDone = true;
    }

    let dragSnapshot = null;
    if (this.node_dragged || (this.last_mouse_dragging && this.current_node)) {
      const primary = this.node_dragged || this.current_node;
      if (primary?.pos) {
        dragSnapshot = { anchor: primary, anchorX: primary.pos[0], anchorY: primary.pos[1], nodes: [] };
        if (this.selected_nodes) {
          for (const id in this.selected_nodes) {
            const n = this.selected_nodes[id];
            if (n?.pos && n !== primary) dragSnapshot.nodes.push({ node: n, x: n.pos[0], y: n.pos[1] });
          }
        }
      }
    }

    const resizingNodeBefore = this.resizing_node || null;
    const result = V1State.originalProcessMouseMove.apply(this, arguments);
    this.__blockSpaceCursorX = event?.canvasX ?? event?.clientX;
    this.__blockSpaceCursorY = event?.canvasY ?? event?.clientY;

    if (event?.shiftKey || !isSnappingEnabled()) {
      renderResizeDebugHud(this);
      updateSnapFeedback(this);
      return result;
    }

    const resizingNode = this.resizing_node || resizingNodeBefore;
    if (resizingNode?.pos && resizingNode?.size && !this.dragging_canvas) {
      applyResizeSnapping(this, resizingNode);
      updateSnapFeedback(this);
      renderResizeDebugHud(this);
      return result;
    }

    this.__blockSpaceResizeDebugStatus = null;
    renderResizeDebugHud(this);
    this.__blockSpacePrevResizeSize = null;
    this.__blockSpaceResizeDimensionMemory = null;
    this.__blockSpaceMoveYPointMemory = null;

    const activeNode = getActiveDraggedNode(this, event);
    if (!activeNode || activeNode.constructor?.name === "LGraphGroup") {
      clearSnapVisual(this);
      updateSnapFeedback(this);
      this.__blockSpacePrevDragPoint = null;
      renderResizeDebugHud(this);
      return result;
    }

    const activeBounds = getNodeBounds(activeNode);
    if (!activeBounds) {
      updateSnapFeedback(this);
      return result;
    }

    const hSnapMargin = getHSnapMargin();
    const vSnapMargin = getVSnapMargin();
    const baseMoveThreshold = SNAP_THRESHOLD / Math.max(0.0001, getCanvasScale(this));
    const exitThresholdCanvas = baseMoveThreshold * getExitThresholdMultiplier();
    const thresholdCanvasX = baseMoveThreshold * getMoveSnapStrength();
    const thresholdCanvasY = baseMoveThreshold * getMoveSnapStrength();

    const recentSnap = this.__blockSpaceRecentSnap;
    const wasSnappedX = recentSnap?.kind === "move" && recentSnap.nodeId === activeNode.id && recentSnap.xDidSnap;
    const wasSnappedY = recentSnap?.kind === "move" && recentSnap.nodeId === activeNode.id && recentSnap.yDidSnap;
    const currentThresholdX = wasSnappedX ? (exitThresholdCanvas * getMoveSnapStrength()) : thresholdCanvasX;
    const currentThresholdY = wasSnappedY ? (exitThresholdCanvas * getMoveSnapStrength()) : thresholdCanvasY;

    const nodes = getGraphNodes(this);
    const selectedNodesMap = this.selected_nodes || null;
    let didSnap = false, xDidSnapMove = false, yDidSnapMove = false;

    // X Axis
    const moveXMemory = ensureMoveXPointMemory(this, activeNode, hSnapMargin);
    const moveXClusters = moveXMemory ? buildDimensionClusters(moveXMemory.points, moveXMemory.tolerancePx) : [];
    const xWinner = pickNearestMoveCluster(moveXClusters, activeBounds.left);

    if (xWinner && Math.abs(activeBounds.left - xWinner.center) <= currentThresholdX) {
      activeNode.pos[0] = Math.round(xWinner.center);
      didSnap = true;
      xDidSnapMove = true;
    }

    // Y Axis
    const moveYMemory = ensureMoveYPointMemory(this, activeNode, vSnapMargin);
    const moveYClusters = buildDimensionClusters(moveYMemory?.points || [], moveYMemory?.tolerancePx || 12);
    const yWinner = pickNearestMoveCluster(moveYClusters, activeBounds.top);

    if (yWinner && Math.abs(activeBounds.top - yWinner.center) <= currentThresholdY) {
      activeNode.pos[1] = Math.round(yWinner.center);
      didSnap = true;
      yDidSnapMove = true;
    }

    // Raycasting snapping - align to closest 2 neighbors in any direction
    const raycastXWinners = [];
    const raycastYWinners = [];
    if (!xDidSnapMove || !yDidSnapMove) {
      const raycastNeighbors = getRaycastNeighborsMulti(
        activeNode,
        activeBounds,
        nodes,
        { maxSearchDistance: 1000, count: 2, selectedNodesMap }
      );

      for (const neighbor of raycastNeighbors) {
        if (!neighbor || !neighbor.bounds) continue;

        const nBounds = neighbor.bounds;
        const threshold = Math.min(currentThresholdX, currentThresholdY) * 1.5;

        // X-axis raycast snapping (if not already snapped on X)
        if (!xDidSnapMove && neighbor.axis === "x") {
          const activeWidth = activeBounds.right - activeBounds.left;
          let targetX = null;

          if (neighbor.direction === "left") {
            // Align right edge of active to left edge of neighbor (with margin)
            targetX = nBounds.left - hSnapMargin - activeWidth;
            if (Math.abs(activeBounds.left - targetX) <= threshold) {
              activeNode.pos[0] = Math.round(targetX);
              didSnap = true;
              xDidSnapMove = true;
              raycastXWinners.push(neighbor.node);
            }
          } else if (neighbor.direction === "right") {
            // Align left edge of active to right edge of neighbor (with margin)
            targetX = nBounds.right + hSnapMargin;
            if (Math.abs(activeBounds.left - targetX) <= threshold) {
              activeNode.pos[0] = Math.round(targetX);
              didSnap = true;
              xDidSnapMove = true;
              raycastXWinners.push(neighbor.node);
            }
          }
        }

        // Y-axis raycast snapping (if not already snapped on Y)
        if (!yDidSnapMove && neighbor.axis === "y") {
          const activeHeight = activeBounds.bottom - activeBounds.top;
          let targetY = null;

          if (neighbor.direction === "above") {
            // Align bottom edge of active to top edge of neighbor (with margin)
            targetY = nBounds.top - vSnapMargin - activeHeight;
            if (Math.abs(activeBounds.top - targetY) <= threshold) {
              activeNode.pos[1] = Math.round(targetY);
              didSnap = true;
              yDidSnapMove = true;
              raycastYWinners.push(neighbor.node);
            }
          } else if (neighbor.direction === "below") {
            // Align top edge of active to bottom edge of neighbor (with margin)
            targetY = nBounds.bottom + vSnapMargin;
            if (Math.abs(activeBounds.top - targetY) <= threshold) {
              activeNode.pos[1] = Math.round(targetY);
              didSnap = true;
              yDidSnapMove = true;
              raycastYWinners.push(neighbor.node);
            }
          }
        }
      }
    }

    if (dragSnapshot?.anchor === activeNode) {
      const totalMoveX = activeNode.pos[0] - dragSnapshot.anchorX;
      const totalMoveY = activeNode.pos[1] - dragSnapshot.anchorY;
      for (const entry of dragSnapshot.nodes) {
        if (entry.node?.pos) {
          entry.node.pos[0] = Math.round(entry.x + totalMoveX);
          entry.node.pos[1] = Math.round(entry.y + totalMoveY);
        }
      }
    }

    // Build winner node lists for guide rendering (only closest by spatial distance)
    const activeBoundsForGuide = getNodeBounds(activeNode);
    const xWinnerNodes = [];
    if (xWinner?.members?.length && activeBoundsForGuide) {
      // Find closest member by spatial distance to active node
      const validMembers = xWinner.members.filter(m => m.node && getNodeBounds(m.node));
      if (validMembers.length) {
        const closest = validMembers.sort((a, b) => {
          const boundsA = getNodeBounds(a.node);
          const boundsB = getNodeBounds(b.node);
          const distA = Math.hypot(boundsA.centerX - activeBoundsForGuide.centerX, boundsA.centerY - activeBoundsForGuide.centerY);
          const distB = Math.hypot(boundsB.centerX - activeBoundsForGuide.centerX, boundsB.centerY - activeBoundsForGuide.centerY);
          return distA - distB;
        })[0];
        if (closest?.node) xWinnerNodes.push(closest.node);
      }
    }
    // Add raycast X winners
    for (const node of raycastXWinners) {
      if (node?.id && !xWinnerNodes.some(n => n.id === node.id)) {
        xWinnerNodes.push(node);
      }
    }

    const yWinnerNodes = [];
    if (yWinner?.members?.length && activeBoundsForGuide) {
      // Find closest member by spatial distance to active node
      const validMembers = yWinner.members.filter(m => m.node && getNodeBounds(m.node));
      if (validMembers.length) {
        const closest = validMembers.sort((a, b) => {
          const boundsA = getNodeBounds(a.node);
          const boundsB = getNodeBounds(b.node);
          const distA = Math.hypot(boundsA.centerX - activeBoundsForGuide.centerX, boundsA.centerY - activeBoundsForGuide.centerY);
          const distB = Math.hypot(boundsB.centerX - activeBoundsForGuide.centerX, boundsB.centerY - activeBoundsForGuide.centerY);
          return distA - distB;
        })[0];
        if (closest?.node) yWinnerNodes.push(closest.node);
      }
    }
    // Add raycast Y winners
    for (const node of raycastYWinners) {
      if (node?.id && !yWinnerNodes.some(n => n.id === node.id)) {
        yWinnerNodes.push(node);
      }
    }

    this.__blockSpaceResizeDebugStatus = {
      active: true,
      axis: "move",
      xDidSnap: xDidSnapMove,
      yDidSnap: yDidSnapMove,
      xWinnerNodes: xWinnerNodes,
      yWinnerNodes: yWinnerNodes,
      activeCenterX: activeBounds.centerX,
      activeCenterY: activeBounds.centerY,
    };

    if (didSnap) {
      rememberRecentSnap(this, {
        kind: "move", nodeId: activeNode.id,
        threshold: Math.max(thresholdCanvasX, thresholdCanvasY),
        xDidSnap: xDidSnapMove, yDidSnap: yDidSnapMove,
        xTarget: xDidSnapMove ? activeNode.pos[0] : null,
        yTarget: yDidSnapMove ? activeNode.pos[1] : null,
      });
      triggerSnapFeedback(this, activeNode, xDidSnapMove, yDidSnapMove);
    }
    updateSnapFeedback(this);
    renderResizeDebugHud(this);
    return result;
  };

  window.LGraphCanvas.prototype.__blockSpaceNodeSnapPatched = true;
  window.BlockSpaceNodeSnap = window.BlockSpaceNodeSnap || {};
  window.BlockSpaceNodeSnap.resetPersistedHighlightArtifacts = (canvas) => resetPersistedHighlightArtifacts(canvas || window.app?.canvas);
  window.BlockSpaceNodeSnap.getHSnapMargin = getHSnapMargin;
  window.BlockSpaceNodeSnap.getVSnapMargin = getVSnapMargin;
}

function initConnectionFocusPatches() {
  if (!window.LGraphCanvas?.prototype || window.LGraphCanvas.prototype.__connectionFocusPatched) return;

  V1State.originalProcessMouseDown = window.LGraphCanvas.prototype.processMouseDown;
  V1State.originalRenderLink = window.LGraphCanvas.prototype.renderLink;
  V1State.originalDrawNodeCF = window.LGraphCanvas.prototype.drawNode;

  window.LGraphCanvas.prototype.processMouseDown = function(event) {
    const isLeft = isLeftPointer(event);
    const nodeBefore = isLeft ? getNodeAtEvent(this, event) : null;
    const result = V1State.originalProcessMouseDown.apply(this, arguments);

    if (!getFocusSettings().enabled) return result;

    if (!isLeft) {
      clearFocusState();
      return result;
    }

    let node = nodeBefore || getNodeAtEvent(this, event) || this.node_over;
    if (!node && this.selected_nodes) {
      for (const id in this.selected_nodes) {
        node = this.selected_nodes[id];
        break;
      }
    }

    if (node?.id != null) setFocusState(this, node.id);
    else clearFocusState();

    return result;
  };

  window.LGraphCanvas.prototype.renderLink = function(ctx, a, b) {
    if (!getFocusSettings().enabled) return V1State.originalRenderLink.apply(this, arguments);

    const link = extractLinkInfo(arguments);
    if (!link) return V1State.originalRenderLink.apply(this, arguments);

    const originNode = this.graph.getNodeById(link.origin_id);
    const slotColor = getSlotColor(originNode, false, link.origin_slot);
    const focus = getActiveFocus(this);

    if (!focus) return drawHardAngleLink(arguments, 0, 0, slotColor);

    const linkKey = link.id != null ? link.id : null;
    const isConnected = focus.connectedLinkIds[linkKey] || focus.connectedLinkIds[String(linkKey)];

    if (!isConnected) {
      ctx.save();
      ctx.globalAlpha *= 0.12;
      const result = drawHardAngleLink(arguments, 0, 0, slotColor);
      ctx.restore();
      return result;
    }

    let sourceOffset = 0, targetOffset = 0;
    const style = getFocusSettings().connectorStyle;
    if ((style === "straight" || style === "angled") && linkKey != null) {
      const laneOffset = Number(focus.linkLaneOffsets?.[String(linkKey)]) || 0;
      if (link.origin_id === focus.activeNodeId) sourceOffset = laneOffset;
      else if (link.target_id === focus.activeNodeId) targetOffset = laneOffset;
    }

    const result = drawHardAngleLink(arguments, sourceOffset, targetOffset, slotColor);
    if (link.origin_id === focus.activeNodeId || link.target_id === focus.activeNodeId) {
      drawFlowOverlay(this, arguments, focus.animationTime || 0, sourceOffset, targetOffset);
    }
    return result;
  };

  if (typeof V1State.originalDrawNodeCF === "function") {
    window.LGraphCanvas.prototype.drawNode = function (node, ctx) {
      if (!getFocusSettings().enabled) return V1State.originalDrawNodeCF.apply(this, arguments);

      const focus = getActiveFocus(this);
      if (!focus || !node) return V1State.originalDrawNodeCF.apply(this, arguments);

      const isActiveNode = node.id === focus.activeNodeId;
      const isConnectedNode = isActiveNode || !!focus.connectedNodeIds[node.id];

      if (!isConnectedNode) {
        const previousEditorAlpha = this.editor_alpha;
        this.editor_alpha = (typeof previousEditorAlpha === "number" ? previousEditorAlpha : 1) * 0.28;
        try {
          return V1State.originalDrawNodeCF.apply(this, arguments);
        } finally {
          this.editor_alpha = previousEditorAlpha;
        }
      }

      const result = V1State.originalDrawNodeCF.apply(this, arguments);

      if (isActiveNode) {
        for (const idx of Object.keys(focus.activeOutputSlots)) {
          drawSlotRing(node, ctx, false, Number(idx), getSlotColor(node, false, Number(idx)) || getFocusSettings().pulseColor);
        }
        for (const idx of Object.keys(focus.activeInputSlots)) {
          drawSlotRing(node, ctx, true, Number(idx), getSlotColor(node, true, Number(idx)) || getFocusSettings().pulseColor);
        }
      }

      if (focus.targetInputsByNode[node.id]) {
        for (const idx of Object.keys(focus.targetInputsByNode[node.id])) {
          drawSlotRing(node, ctx, true, Number(idx), getSlotColor(node, true, Number(idx)) || getFocusSettings().pulseColor);
        }
      }

      if (focus.sourceOutputSlotsByNode[node.id]) {
        for (const idx of Object.keys(focus.sourceOutputSlotsByNode[node.id])) {
          drawSlotRing(node, ctx, false, Number(idx), getSlotColor(node, false, Number(idx)) || getFocusSettings().pulseColor);
        }
      }

      return result;
    };
  }

  // Store named handlers for cleanup
  V1State.focusBlurHandler = clearFocusState;
  V1State.focusMouseupHandler = () => { if (focusState.isHolding) clearFocusState(); };
  V1State.focusKeydownHandler = (e) => { if (e?.key === "Escape") clearFocusState(); };

  window.addEventListener("blur", V1State.focusBlurHandler, true);
  document.addEventListener("mouseup", V1State.focusMouseupHandler, true);
  document.addEventListener("keydown", V1State.focusKeydownHandler, true);

  window.__connectionFocusState = focusState;
  window.LGraphCanvas.prototype.__connectionFocusPatched = true;
}

function initSmartSizingPatches() {
  const PATCH_VERSION = "2026-03-01-adapter";

  if (!window.LiteGraph || !window.LGraphNode?.prototype) return;

  if (window.LGraphNode.prototype.__smartSizingPatched) {
    if (window.LGraphNode.prototype.__smartSizingPatchVersion === PATCH_VERSION) return;
    if (typeof window.LGraphNode.prototype.__smartSizingOriginalComputeSize === "function") {
      window.LGraphNode.prototype.computeSize = window.LGraphNode.prototype.__smartSizingOriginalComputeSize;
    }
    if (typeof window.LGraphNode.prototype.__smartSizingOriginalSetSize === "function") {
      window.LGraphNode.prototype.setSize = window.LGraphNode.prototype.__smartSizingOriginalSetSize;
    }
  }

  V1State.originalComputeSize = window.LGraphNode.prototype.computeSize;
  V1State.originalSetSize = window.LGraphNode.prototype.setSize;
  V1State.originalConfigure = window.LGraphNode.prototype.configure;
  V1State.originalGraphAdd = window.LGraph?.prototype?.add;
  V1State.originalDrawNodeSS = window.LGraphCanvas?.prototype?.drawNode;

  if (typeof V1State.originalComputeSize !== "function" || typeof V1State.originalSetSize !== "function") return;

  window.LGraphNode.prototype.computeSize = function (out) {
    const size = out || new Float32Array([0, 0]);
    let rows = Math.max(this.inputs?.length || 1, this.outputs?.length || 1, 1);

    const maxInputWidth = getSlotMaxWidth(this.inputs);
    const maxOutputWidth = getSlotMaxWidth(this.outputs);
    const titleWidth = Math.min(MAX_TEXT_WIDTH, measureTextWidth(truncateToWidth(this.title || "", MAX_TEXT_WIDTH)));

    const slotTextWidth = Math.min((MAX_TEXT_WIDTH * 2) + PORT_PADDING, maxInputWidth + maxOutputWidth + PORT_PADDING);
    const textMinWidth = Math.max(slotTextWidth, titleWidth + PORT_PADDING, MIN_NODE_WIDTH);

    const widgetBounds = computeWidgetBounds(this, textMinWidth);
    let minWidth = Math.max(textMinWidth, widgetBounds.width);

    const slotStartY = this.constructor.slot_start_y || 0;
    const slotHeight = window.LiteGraph?.NODE_SLOT_HEIGHT || 20;
    let minHeight = slotStartY + rows * slotHeight;

    if (widgetBounds.height > 0) {
      if (this.widgets_up) minHeight = Math.max(minHeight, widgetBounds.height);
      else if (this.widgets_start_y != null) minHeight = Math.max(minHeight, widgetBounds.height + this.widgets_start_y);
      else minHeight += widgetBounds.height;
    }

    if (this.constructor.min_height && minHeight < this.constructor.min_height) {
      minHeight = this.constructor.min_height;
    }
    minHeight += 6;

    const resizing = isNodeBeingResized(this);
    if (!resizing && this.__smartUserSize?.length >= 2) {
      minWidth = Math.max(minWidth, this.__smartUserSize[0]);
      minHeight = Math.max(minHeight, this.__smartUserSize[1]);
    }

    this.__smartMinSize = [minWidth, minHeight];
    size[0] = minWidth;
    size[1] = minHeight;
    return size;
  };

  window.LGraphNode.prototype.setSize = function (size) {
    const result = V1State.originalSetSize.apply(this, arguments);
    if (isNodeBeingResized(this) && this.size?.length >= 2) {
      this.__smartUserSize = [this.size[0], this.size[1]];
    }
    return result;
  };

  if (typeof V1State.originalConfigure === "function") {
    window.LGraphNode.prototype.configure = function (info) {
      const result = V1State.originalConfigure.apply(this, arguments);
      if (this.size?.length >= 2) this.__smartUserSize = [this.size[0], this.size[1]];
      return result;
    };
  }

  if (V1State.originalGraphAdd) {
    window.LGraph.prototype.add = function (node, skipComputeOrder) {
      const result = V1State.originalGraphAdd.apply(this, arguments);
      if (node && node.constructor !== window.LGraphGroup && typeof node.computeSize === "function" && typeof node.setSize === "function") {
        node.setSize(node.computeSize());
      }
      return result;
    };
  }

  if (typeof V1State.originalDrawNodeSS === "function") {
    window.LGraphCanvas.prototype.drawNode = function (node, ctx) {
      const restorations = applyTruncatedLabelsTemporarily(node);
      try {
        return V1State.originalDrawNodeSS.apply(this, arguments);
      } finally {
        restoreTemporaryValues(restorations);
      }
    };
  }

  window.refreshSmartNodeSize = (node) => {
    if (node?.computeSize && node.setSize) node.setSize(node.computeSize());
  };

  window.LGraphNode.prototype.__smartSizingPatched = true;
  window.LGraphNode.prototype.__smartSizingPatchVersion = PATCH_VERSION;
  window.LGraphNode.prototype.__smartSizingOriginalComputeSize = V1State.originalComputeSize;
  window.LGraphNode.prototype.__smartSizingOriginalSetSize = V1State.originalSetSize;
}

function initNodeArrangement() {
  if (window.__blockSpaceArrangementPoller) clearInterval(window.__blockSpaceArrangementPoller);
  window.__blockSpaceArrangementPoller = setInterval(updatePanelVisibility, 200);
}

function isNodeBeingResized(node) {
  if (!node?.graph?.list_of_graphcanvas) return false;
  for (const canvas of node.graph.list_of_graphcanvas) {
    if (canvas?.resizing_node === node) return true;
  }
  return false;
}

// ============================================================================
// Unified MouseUp Handler
// ============================================================================

function initUnifiedMouseUpHandler() {
  const originalProcessMouseUp = window.LGraphCanvas.prototype.processMouseUp;
  V1State.originalProcessMouseUp = originalProcessMouseUp;

  window.LGraphCanvas.prototype.processMouseUp = function(event) {
    const smartDropState = captureOriginDragState(this);
    const hadSmartDropDrag = !!smartDropState;

    const result = originalProcessMouseUp.apply(this, arguments);

    // Snap commit
    const nodeHint = this.resizing_node || this.node_dragged || this.current_node;
    maybeCommitSnapOnMouseUp(this, nodeHint);
    clearSnapVisual(this);
    clearSnapFeedbackState(this);
    this.__blockSpacePrevDragPoint = null;
    this.__blockSpaceMoveXPointMemory = null;
    this.__blockSpaceMoveYPointMemory = null;
    this.__blockSpacePrevResizeSize = null;
    this.__blockSpaceResizeDimensionMemory = null;
    this.__blockSpaceResizeDebugStatus = null;
    this.__blockSpaceRecentSnap = null;
    renderResizeDebugHud(this);

    // Clear focus
    clearFocusState();

    // Smart drop
    if (hadSmartDropDrag && smartDropState?.originOutput) {
      const currentLinkCount = smartDropState.originOutput.links?.length || 0;
      if (currentLinkCount <= smartDropState.linkCountBefore) {
        const dropCanvasX = event?.canvasX;
        const dropCanvasY = event?.canvasY;
        if (this.graph?.getNodeOnPos && typeof dropCanvasX === "number" && typeof dropCanvasY === "number") {
          const targetNode = this.graph.getNodeOnPos(dropCanvasX, dropCanvasY);
          if (targetNode?.inputs?.length) {
            const validMatches = [];
            for (let i = 0; i < targetNode.inputs.length; i++) {
              const input = targetNode.inputs[i];
              if (input && areTypesCompatible(smartDropState.originOutput.type, input.type)) {
                validMatches.push({ inputIndex: i, inputName: input.name || "input_" + i });
              }
            }
            if (validMatches.length === 1) {
              smartDropState.originNode.connect(smartDropState.originSlotIndex, targetNode, validMatches[0].inputIndex);
            } else if (validMatches.length > 1) {
              createAmbiguityMenu({
                clientX: event.clientX || 0,
                clientY: event.clientY || 0,
                matches: validMatches,
                originNode: smartDropState.originNode,
                originSlotIndex: smartDropState.originSlotIndex,
                targetNode,
                canvasElement: this.canvas,
              });
            }
          }
        }
      }
    }

    return result;
  };
}

// ============================================================================
// Main Export
// ============================================================================

function getLGraphCanvas() {
  // Try multiple ways to get the canvas reference
  return window.app?.canvas || window.LGraphCanvas?.active_canvas || window.graphcanvas;
}

function redrawCanvas() {
  const canvas = getLGraphCanvas();
  if (!canvas) return;
  
  // Mark dirty to trigger redraw on next animation frame
  // This avoids screen tearing from forced synchronous draws
  if (canvas.setDirty) {
    canvas.setDirty(true, true);
  }
}

function handleSettingChange(settingId, value) {
  // Visual settings that need immediate canvas redraw
  const visualSettings = [
    "BlockSpace.Snap.HighlightEnabled",
    "BlockSpace.Snap.HighlightColor",
    "BlockSpace.Snap.FeedbackPulseMs",
    "BlockSpace.EnableCustomConnectors",
    "BlockSpace.ConnectorStyle",
    "BlockSpace.ConnectorStubLength",
  ];

  if (visualSettings.includes(settingId)) {
    redrawCanvas();
  }

  // Invalidate caches for settings that affect snap logic
  const snapLogicSettings = [
    "BlockSpace.Snap.Enabled",
    "BlockSpace.Snap.Aggressiveness",
    "BlockSpace.Snap.Sensitivity",
    "BlockSpace.Snap.HMarginPx",
    "BlockSpace.Snap.VMarginPx",
  ];

  if (snapLogicSettings.includes(settingId)) {
    // Clear point memory so next drag uses new values
    if (window.app?.canvas) {
      window.app.canvas.__blockSpaceMoveXPointMemory = null;
      window.app.canvas.__blockSpaceMoveYPointMemory = null;
      window.app.canvas.__blockSpaceResizeDimensionMemory = null;
    }
  }
}

export function initV1Adapter() {
  if (!window.LGraphCanvas?.prototype) {
    console.error('[BlockSpace V1 Adapter] LGraphCanvas not available');
    return false;
  }
  if (window.__blockSpaceV1AdapterInitialized) return true;

  initSmartSizingPatches();
  initNodeArrangement();
  initConnectionFocusPatches();
  initNodeSnappingPatches();
  initUnifiedMouseUpHandler();

  // Subscribe to setting changes for real-time updates
  V1State.settingsUnsubscribe = onAnySettingChanged(handleSettingChange);

  window.__blockSpaceV1AdapterInitialized = true;
  console.log('[BlockSpace] V1 Adapter initialized');
  return true;
}

export function cleanupV1Adapter() {
  // Remove global event listeners first
  if (V1State.focusBlurHandler) {
    window.removeEventListener("blur", V1State.focusBlurHandler, true);
    V1State.focusBlurHandler = null;
  }
  if (V1State.focusMouseupHandler) {
    document.removeEventListener("mouseup", V1State.focusMouseupHandler, true);
    V1State.focusMouseupHandler = null;
  }
  if (V1State.focusKeydownHandler) {
    document.removeEventListener("keydown", V1State.focusKeydownHandler, true);
    V1State.focusKeydownHandler = null;
  }

  if (V1State.originalProcessMouseMove) window.LGraphCanvas.prototype.processMouseMove = V1State.originalProcessMouseMove;
  if (V1State.originalProcessMouseUp) window.LGraphCanvas.prototype.processMouseUp = V1State.originalProcessMouseUp;
  if (V1State.originalProcessMouseDown) window.LGraphCanvas.prototype.processMouseDown = V1State.originalProcessMouseDown;
  if (V1State.originalRenderLink) window.LGraphCanvas.prototype.renderLink = V1State.originalRenderLink;
  
  // Restore drawNode in reverse order of patching: SS first, then CF
  // This ensures we don't lose the chain of original references
  if (V1State.originalDrawNodeSS) {
    window.LGraphCanvas.prototype.drawNode = V1State.originalDrawNodeSS;
  } else if (V1State.originalDrawNodeCF) {
    window.LGraphCanvas.prototype.drawNode = V1State.originalDrawNodeCF;
  }
  
  if (V1State.originalComputeSize) window.LGraphNode.prototype.computeSize = V1State.originalComputeSize;
  if (V1State.originalSetSize) window.LGraphNode.prototype.setSize = V1State.originalSetSize;
  if (V1State.originalConfigure) window.LGraphNode.prototype.configure = V1State.originalConfigure;

  if (window.__blockSpaceArrangementPoller) {
    clearInterval(window.__blockSpaceArrangementPoller);
    window.__blockSpaceArrangementPoller = null;
  }
  stopAnimationLoop();

  // Unsubscribe from setting changes
  if (V1State.settingsUnsubscribe) {
    V1State.settingsUnsubscribe();
    V1State.settingsUnsubscribe = null;
  }

  const panel = document.getElementById("block-space-arrangement-panel");
  if (panel?.parentNode) panel.parentNode.removeChild(panel);
  clearDimensionAssociationLayer();
  destroyActiveMenu();

  window.__blockSpaceV1AdapterInitialized = false;
  if (window.LGraphCanvas?.prototype) {
    window.LGraphCanvas.prototype.__blockSpaceNodeSnapPatched = false;
    window.LGraphCanvas.prototype.__connectionFocusPatched = false;

  }
  if (window.LGraphNode?.prototype) {
    window.LGraphNode.prototype.__smartSizingPatched = false;
  }

  console.log('[BlockSpace] V1 Adapter cleaned up');
}

export default { initV1Adapter, cleanupV1Adapter };

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
  computeWinningXCandidate,
  getSettingValue,
  getHSnapMargin,
  getVSnapMargin,
  getSnapThreshold,
  isSnappingEnabled,
  getMoveSnapStrength,
  getResizeSnapStrength,
  getMoveYSnapStrength,
  getDimensionTolerancePx,
  getHighlightEnabled,
  getHighlightColor,
  getFeedbackEnabled,
  getFeedbackPulseMs,
  getFeedbackColorX,
  getFeedbackColorY,
  getFeedbackColorXY,
} from './core-math.js';

// ============================================================================
// Constants
// ============================================================================

const SNAP_THRESHOLD = 10;
const EXIT_THRESHOLD_MULTIPLIER = 1.5;
const SNAP_MOUSEUP_GRACE_MS = 220;
const SNAP_MOUSEUP_TOLERANCE_MULTIPLIER = 1.8;
const DIMENSION_ASSOC_LAYER_ID = "block-space-dimension-association-layer";
const CONNECTOR_FAN_SPACING = 8;

// ============================================================================
// State Storage for Original Methods
// ============================================================================

const V1State = {
  // Node Snapping
  originalProcessMouseMove: null,
  originalProcessMouseUp: null,
  // Connection Focus
  originalProcessMouseDown: null,
  originalRenderLink: null,
  originalDrawNodeCF: null,
  // Smart Drop
  // (shares processMouseUp with snapping)
  // Smart Sizing
  originalComputeSize: null,
  originalSetSize: null,
  originalConfigure: null,
  originalGraphAdd: null,
  originalDrawNodeSS: null,
};

// ============================================================================
// Section 1: Node Snapping Adapter
// ============================================================================

function getCanvasScale(canvas) {
  const scale = canvas && canvas.ds ? Number(canvas.ds.scale) : 1;
  return isFinite(scale) && scale > 0 ? scale : 1;
}

function isLeftMouseDown(event) {
  if (!event) return false;
  const buttons = Number(event.buttons);
  if (isFinite(buttons) && buttons >= 0) {
    return (buttons & 1) === 1;
  }
  const which = Number(event.which);
  return which === 1;
}

function getActiveDraggedNode(canvas, event) {
  if (!canvas) return null;
  if (canvas.dragging_canvas || canvas.resizing_node || canvas.selected_group_resizing) {
    return null;
  }
  if (canvas.node_dragged && canvas.node_dragged.pos && canvas.node_dragged.size) {
    return canvas.node_dragged;
  }
  if (
    isLeftMouseDown(event) &&
    canvas.last_mouse_dragging &&
    canvas.current_node &&
    canvas.current_node.pos &&
    canvas.current_node.size &&
    !canvas.connecting_node
  ) {
    return canvas.current_node;
  }
  return null;
}

function getGraphNodes(canvas) {
  if (!canvas || !canvas.graph || !Array.isArray(canvas.graph._nodes)) {
    return [];
  }
  return canvas.graph._nodes;
}

function ensureResizeDimensionMemory(canvas, resizingNode) {
  if (!canvas || !resizingNode) return null;
  const memory = canvas.__blockSpaceResizeDimensionMemory;
  if (memory && memory.nodeId === resizingNode.id) {
    return memory;
  }

  const allNodes = getGraphNodes(canvas);
  const activeBounds = getNodeBounds(resizingNode);
  if (!activeBounds) return null;

  const padding = 1500;
  const targetNodes = [];
  for (let nIdx = 0; nIdx < allNodes.length; nIdx++) {
    const n = allNodes[nIdx];
    if (!n || n === resizingNode || (n.constructor && n.constructor.name === "LGraphGroup")) continue;
    const b = getNodeBounds(n);
    if (!b) continue;

    const isNearX = b.right >= (activeBounds.left - padding) && b.left <= (activeBounds.right + padding);
    const isNearY = b.bottom >= (activeBounds.top - padding) && b.top <= (activeBounds.bottom + padding);

    if (isNearX && isNearY) {
      targetNodes.push(n);
    }
  }

  const widthSamples = [];
  const heightSamples = [];
  const rightEdgeSamples = [];
  const bottomEdgeSamples = [];

  const hSnapMargin = getHSnapMargin();
  const vSnapMargin = getVSnapMargin();

  for (let i = 0; i < targetNodes.length; i += 1) {
    const node = targetNodes[i];
    const bounds = getNodeBounds(node);
    if (!bounds) continue;

    const targetWidth = bounds.right - bounds.left;
    const targetHeight = bounds.bottom - bounds.top;
    if (isFinite(targetWidth) && targetWidth > 0) widthSamples.push({ value: targetWidth, node: node });
    if (isFinite(targetHeight) && targetHeight > 0) heightSamples.push({ value: targetHeight, node: node });

    rightEdgeSamples.push({ value: bounds.right, node: node });
    rightEdgeSamples.push({ value: bounds.left, node: node });
    rightEdgeSamples.push({ value: bounds.left - hSnapMargin, node: node });

    bottomEdgeSamples.push({ value: bounds.bottom, node: node });
    bottomEdgeSamples.push({ value: bounds.top, node: node });
    bottomEdgeSamples.push({ value: bounds.top - vSnapMargin, node: node });
  }

  const tolerancePx = getDimensionTolerancePx();
  const newMemory = {
    nodeId: resizingNode.id,
    tolerancePx: tolerancePx,
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
  if (memory && memory.nodeId === activeNode.id) {
    return memory;
  }

  const allNodes = getGraphNodes(canvas);
  const activeBounds = getNodeBounds(activeNode);
  if (!activeBounds) return null;

  const selectedNodesMap = canvas.selected_nodes || null;
  const padding = 1500;
  const points = [];
  const activeHeight = activeBounds.bottom - activeBounds.top;

  for (let nIdx = 0; nIdx < allNodes.length; nIdx++) {
    const node = allNodes[nIdx];
    if (!node || node === activeNode || (node.constructor && node.constructor.name === "LGraphGroup")) continue;
    if (selectedNodesMap && node.id != null && selectedNodesMap[node.id]) continue;

    const bounds = getNodeBounds(node);
    if (!bounds) continue;

    const isNearX = bounds.right >= (activeBounds.left - padding) && bounds.left <= (activeBounds.right + padding);
    const isNearY = bounds.bottom >= (activeBounds.top - padding) && bounds.top <= (activeBounds.bottom + padding);

    if (isNearX && isNearY) {
      points.push({ value: bounds.top, node: node, type: "top_flush" });
      points.push({ value: bounds.bottom - activeHeight, node: node, type: "bottom_flush" });
      points.push({ value: bounds.bottom + vSnapMargin, node: node, type: "stack_below" });
      points.push({ value: bounds.top - vSnapMargin - activeHeight, node: node, type: "stack_above" });
    }
  }

  const newMemory = {
    nodeId: activeNode.id,
    tolerancePx: getDimensionTolerancePx(),
    points: points,
    createdAt: Date.now(),
  };
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
  const padding = 1500;
  const points = [];
  const activeWidth = activeBounds.right - activeBounds.left;

  for (let nIdx = 0; nIdx < allNodes.length; nIdx++) {
    const node = allNodes[nIdx];
    if (!node || node === activeNode || (node.constructor && node.constructor.name === "LGraphGroup")) continue;
    if (selectedNodesMap && node.id != null && selectedNodesMap[node.id]) continue;

    const bounds = getNodeBounds(node);
    if (!bounds) continue;

    const isNearX = bounds.right >= (activeBounds.left - padding) && bounds.left <= (activeBounds.right + padding);
    const isNearY = bounds.bottom >= (activeBounds.top - padding) && bounds.top <= (activeBounds.bottom + padding);

    if (isNearX && isNearY) {
      points.push({ value: bounds.left, node: node, type: "left_flush" });
      points.push({ value: bounds.right - activeWidth, node: node, type: "right_flush" });
      points.push({ value: bounds.left + (bounds.right - bounds.left) * 0.5 - activeWidth * 0.5, node: node, type: "center_flush" });
      points.push({ value: bounds.right + hSnapMargin, node: node, type: "stack_right" });
      points.push({ value: bounds.left - hSnapMargin - activeWidth, node: node, type: "stack_left" });
    }
  }

  const newMemory = {
    nodeId: activeNode.id,
    tolerancePx: getDimensionTolerancePx(),
    points: points,
    createdAt: Date.now(),
  };
  canvas.__blockSpaceMoveXPointMemory = newMemory;
  return newMemory;
}

function getDragDelta(canvas, event) {
  if (!canvas || !event || typeof event.canvasX !== "number" || typeof event.canvasY !== "number") {
    return { dx: 0, dy: 0 };
  }
  const prev = canvas.__blockSpacePrevDragPoint;
  const current = { x: event.canvasX, y: event.canvasY };
  canvas.__blockSpacePrevDragPoint = current;
  if (!prev) {
    return { dx: 0, dy: 0 };
  }
  return {
    dx: current.x - prev.x,
    dy: current.y - prev.y,
  };
}

function getResizeDelta(canvas, node) {
  if (!canvas || !node || !node.size || node.size.length < 2) {
    return { dw: 0, dh: 0 };
  }
  const current = {
    id: node.id != null ? node.id : null,
    w: Number(node.size[0]) || 0,
    h: Number(node.size[1]) || 0,
  };
  const prev = canvas.__blockSpacePrevResizeSize;
  canvas.__blockSpacePrevResizeSize = current;
  if (!prev || prev.id !== current.id) {
    return { dw: 0, dh: 0 };
  }
  return {
    dw: current.w - prev.w,
    dh: current.h - prev.h,
  };
}

function getNodeMinSize(node) {
  let minWidth = 10;
  let minHeight = 10;
  if (!node) {
    return [minWidth, minHeight];
  }

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
      const computed = node.computeSize(node.size && node.size.length >= 1 ? node.size[0] : undefined);
      if (computed && computed.length >= 2) {
        minWidth = Math.max(minWidth, Number(computed[0]) || minWidth);
        minHeight = Math.max(minHeight, Number(computed[1]) || minHeight);
      }
    } catch (error) {
      // Ignore
    }
  }

  return [minWidth, minHeight];
}

function applyResizeSnapping(canvas, resizingNode, resizeAxisLock, resizeDelta) {
  if (!canvas || !resizingNode || (resizingNode.constructor && resizingNode.constructor.name === "LGraphGroup")) {
    return false;
  }

  const bounds = getNodeBounds(resizingNode);
  if (!bounds) return false;

  const thresholdCanvas = (SNAP_THRESHOLD / Math.max(0.0001, getCanvasScale(canvas))) * getResizeSnapStrength();
  const exitThresholdCanvas = thresholdCanvas * EXIT_THRESHOLD_MULTIPLIER;
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
  const status = {
    active: true,
    node: resizingNode && (resizingNode.title || resizingNode.type || resizingNode.id),
    axis: resizeAxisLock || "both",
    activeLeft: bounds.left,
    activeTop: bounds.top,
    xThreshold: thresholdCanvas,
    xReference: currentWidth,
    yThreshold: thresholdCanvas,
    yReference: currentHeight,
    xWinnerNodes: [],
    yWinnerNodes: [],
    xDidSnap: false,
    yDidSnap: false,
    didSnap: false,
  };

  let bestXWidth = null;
  let bestXDelta = Infinity;
  let bestXMode = null;
  let bestXNodes = [];

  if (widthWinner) {
    bestXDelta = Math.abs(currentWidth - widthWinner.center);
    bestXWidth = widthWinner.center;
    bestXMode = "dimension_match";
    bestXNodes = widthWinner.members.map(function(m) { return m.node; }).filter(n => !!n);
  }

  if (rightEdgeWinner) {
    const edgeDelta = Math.abs(currentRight - rightEdgeWinner.center);
    if (edgeDelta < (bestXDelta - 2)) {
      bestXDelta = edgeDelta;
      bestXWidth = rightEdgeWinner.center - bounds.left;
      bestXMode = "edge_align_right";
      bestXNodes = rightEdgeWinner.members.map(function(m) { return m.node; }).filter(n => !!n);
    }
  }

  status.xMode = bestXMode;
  status.xWinnerNodes = bestXNodes;

  const recentSnap = canvas.__blockSpaceRecentSnap;
  const wasSnappedX = recentSnap && recentSnap.kind === "resize" && recentSnap.nodeId === resizingNode.id && recentSnap.xDidSnap;
  const currentThresholdX = wasSnappedX ? exitThresholdCanvas : thresholdCanvas;

  if (bestXWidth !== null && bestXDelta <= currentThresholdX) {
    const nextWidth = Math.max(minSize[0], bestXWidth);
    if (isFinite(nextWidth) && Math.abs(nextWidth - currentWidth) > 0.01) {
      resizingNode.size[0] = nextWidth;
      didSnap = true;
      status.xDidSnap = true;
      status.xTarget = bestXWidth;
      status.xDelta = bestXDelta;
    }
  }

  let bestYHeight = null;
  let bestYDelta = Infinity;
  let bestYMode = null;
  let bestYNodes = [];
  const titleH = Number(window.LiteGraph && window.LiteGraph.NODE_TITLE_HEIGHT) || 24;

  if (heightWinner) {
    bestYDelta = Math.abs(currentHeight - heightWinner.center);
    bestYHeight = heightWinner.center;
    bestYMode = "dimension_match";
    bestYNodes = heightWinner.members.map(function(m) { return m.node; }).filter(n => !!n);
  }

  if (bottomEdgeWinner) {
    const edgeDeltaY = Math.abs(currentBottom - bottomEdgeWinner.center);
    if (edgeDeltaY < (bestYDelta - 2)) {
      bestYDelta = edgeDeltaY;
      bestYHeight = bottomEdgeWinner.center - bounds.top;
      bestYMode = "edge_align_bottom";
      bestYNodes = bottomEdgeWinner.members.map(function(m) { return m.node; }).filter(n => !!n);
    }
  }

  status.yMode = bestYMode;
  status.yWinnerNodes = bestYNodes;

  const wasSnappedY = recentSnap && recentSnap.kind === "resize" && recentSnap.nodeId === resizingNode.id && recentSnap.yDidSnap;
  const currentThresholdY = wasSnappedY ? exitThresholdCanvas : thresholdCanvas;

  if (bestYHeight !== null && bestYDelta <= currentThresholdY) {
    const nextContentHeight = Math.max(minSize[1], bestYHeight - titleH);
    if (isFinite(nextContentHeight) && Math.abs(nextContentHeight - resizingNode.size[1]) > 0.01) {
      resizingNode.size[1] = nextContentHeight;
      didSnap = true;
      status.yDidSnap = true;
      status.yTarget = bestYHeight;
      status.yDelta = bestYDelta;
    }
  }

  status.didSnap = didSnap;
  canvas.__blockSpaceResizeDebugStatus = status;

  if (didSnap) {
    rememberRecentSnap(canvas, {
      kind: "resize",
      nodeId: resizingNode.id,
      threshold: thresholdCanvas,
      xDidSnap: !!status.xDidSnap,
      yDidSnap: !!status.yDidSnap,
      xTargetRight: status.xDidSnap ? bounds.left + status.xTarget : null,
      yTargetBottom: status.yDidSnap ? bounds.top + status.yTarget : null,
    });
    triggerSnapFeedback(canvas, resizingNode, !!status.xDidSnap, !!status.yDidSnap, false);
  }
  return didSnap;
}

function clearSnapVisual(canvas) {
  if (!canvas || !canvas.__blockSpaceWinnerHighlight) {
    return;
  }
  canvas.__blockSpaceWinnerHighlight = null;
  canvas.dirty_canvas = true;
  canvas.dirty_bgcanvas = true;
}

function resetPersistedHighlightArtifacts(canvas) {
  clearSnapFeedbackState(canvas, true);
  if (!canvas) return;
  const nodes = getGraphNodes(canvas);
  let changed = false;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node || (node.constructor && node.constructor.name === "LGraphGroup")) continue;
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
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i] && nodes[i].id === id) {
      return nodes[i];
    }
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
  if (!node || (node.constructor && node.constructor.name === "LGraphGroup") || !node.pos || !node.size) return false;

  const bounds = getNodeBounds(node);
  if (!bounds) return false;

  const tolerance = Math.max(2, (Number(snap.threshold) || 0) * SNAP_MOUSEUP_TOLERANCE_MULTIPLIER);
  let appliedX = false;
  let appliedY = false;

  if (snap.kind === "move") {
    if (snap.xDidSnap && typeof snap.xTarget === "number" && Math.abs(bounds.left - snap.xTarget) <= tolerance) {
      node.pos[0] = snap.xTarget;
      appliedX = true;
    }
    if (snap.yDidSnap && typeof snap.yTarget === "number" && Math.abs(bounds.top - snap.yTarget) <= tolerance) {
      node.pos[1] = snap.yTarget;
      appliedY = true;
    }
  } else if (snap.kind === "resize") {
    const minSize = getNodeMinSize(node);
    const titleH = Number(window.LiteGraph && window.LiteGraph.NODE_TITLE_HEIGHT) || 24;
    if (snap.xDidSnap && typeof snap.xTargetRight === "number" && Math.abs(bounds.right - snap.xTargetRight) <= tolerance) {
      node.size[0] = Math.max(minSize[0], snap.xTargetRight - bounds.left);
      appliedX = true;
    }
    if (snap.yDidSnap && typeof snap.yTargetBottom === "number" && Math.abs(bounds.bottom - snap.yTargetBottom) <= tolerance) {
      node.size[1] = Math.max(minSize[1], (snap.yTargetBottom - bounds.top) - titleH);
      appliedY = true;
    }
  }

  if (appliedX || appliedY) {
    triggerSnapFeedback(canvas, node, appliedX, appliedY, snap.kind === "move");
    return true;
  }
  return false;
}

function ensureDimensionAssociationLayer() {
  let layer = document.getElementById(DIMENSION_ASSOC_LAYER_ID);
  if (layer) return layer;
  layer = document.createElement("div");
  layer.id = DIMENSION_ASSOC_LAYER_ID;
  layer.style.position = "fixed";
  layer.style.left = "0";
  layer.style.top = "0";
  layer.style.width = "100vw";
  layer.style.height = "100vh";
  layer.style.pointerEvents = "none";
  layer.style.zIndex = "9999";
  document.body.appendChild(layer);
  return layer;
}

function clearDimensionAssociationLayer() {
  const layer = document.getElementById(DIMENSION_ASSOC_LAYER_ID);
  if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
}

function graphToClient(canvas, x, y) {
  if (!canvas || !canvas.canvas) return null;
  const rect = canvas.canvas.getBoundingClientRect();
  const scale = getCanvasScale(canvas);
  const offset = canvas.ds && canvas.ds.offset ? canvas.ds.offset : [0, 0];
  return {
    x: rect.left + (x + (Number(offset[0]) || 0)) * scale,
    y: rect.top + (y + (Number(offset[1]) || 0)) * scale,
  };
}

function renderDimensionAssociationHighlights(canvas, status) {
  const layer = ensureDimensionAssociationLayer();
  if (!layer) return;
  while (layer.firstChild) layer.removeChild(layer.firstChild);
  if (!canvas || !status || !status.active) return;

  const scale = getCanvasScale(canvas);
  const borderW = 2;
  const guideColor = getHighlightColor();

  function appendLine(x, y, w, h, color) {
    const line = document.createElement("div");
    line.style.position = "fixed";
    line.style.left = Math.round(x) + "px";
    line.style.top = Math.round(y) + "px";
    line.style.width = Math.max(0, Math.round(w)) + "px";
    line.style.height = Math.max(0, Math.round(h)) + "px";
    line.style.border = borderW + "px dotted " + color;
    line.style.boxSizing = "border-box";
    line.style.opacity = "0.95";
    layer.appendChild(line);
  }

  const nodeMap = {};
  function trackNode(node, axis) {
    if (!node || node.id == null) return;
    const key = String(node.id);
    if (!nodeMap[key]) nodeMap[key] = { node: node, width: false, height: false };
    nodeMap[key][axis] = true;
  }

  const xNodes = status.xDidSnap ? (status.xWinnerNodes || []) : [];
  const yNodes = status.yDidSnap ? (status.yWinnerNodes || []) : [];
  for (let i = 0; i < xNodes.length; i++) trackNode(xNodes[i], "width");
  for (let j = 0; j < yNodes.length; j++) trackNode(yNodes[j], "height");

  for (const key in nodeMap) {
    if (!Object.prototype.hasOwnProperty.call(nodeMap, key)) continue;
    const item = nodeMap[key];
    const bounds = getNodeBounds(item.node);
    if (!bounds) continue;
    const topLeft = graphToClient(canvas, bounds.left, bounds.top);
    if (!topLeft) continue;
    const left = topLeft.x;
    const top = topLeft.y;
    const width = Math.max(0, (bounds.right - bounds.left) * scale);
    const height = Math.max(0, (bounds.bottom - bounds.top) * scale);

    if (item.width) {
      if (status.axis === "move") {
        const xMode = status.xMode || "";
        const anchorCanvasX = xMode.indexOf("right") !== -1 ? bounds.right : (xMode.indexOf("center") !== -1 ? bounds.left + (bounds.right - bounds.left) / 2 : bounds.left);
        const lineXClient = graphToClient(canvas, anchorCanvasX, bounds.top).x;
        if (xMode.indexOf("right") !== -1) lineXClient -= borderW;
        appendLine(lineXClient, top, borderW, height, guideColor);
      } else {
        if (status.xMode === "edge_align_right") {
          const snappedCanvasX = status.activeLeft + status.xTarget;
          const isLeftEdge = Math.abs(snappedCanvasX - bounds.left) < Math.abs(snappedCanvasX - bounds.right);
          const anchorCanvasX = isLeftEdge ? bounds.left : bounds.right;
          let lineXClient = graphToClient(canvas, anchorCanvasX, bounds.top).x;
          if (!isLeftEdge) lineXClient -= borderW;
          appendLine(lineXClient, top, borderW, height, guideColor);
        } else {
          appendLine(left, top, borderW, height, guideColor);
          appendLine(left + width - borderW, top, borderW, height, guideColor);
        }
      }
    }
    if (item.height) {
      if (status.axis === "move") {
        const snapLineY = status.yLine;
        const isTopEdge = Math.abs(snapLineY - bounds.top) < Math.abs(snapLineY - bounds.bottom);
        const anchorCanvasY = isTopEdge ? bounds.top : bounds.bottom;
        let lineYClient = graphToClient(canvas, bounds.left, anchorCanvasY).y;
        if (!isTopEdge) lineYClient -= borderW;
        appendLine(left, lineYClient, width, borderW, guideColor);
      } else {
        if (status.yMode === "edge_align_bottom") {
          const snappedCanvasY = status.activeTop + status.yTarget;
          const isTopEdge = Math.abs(snappedCanvasY - bounds.top) < Math.abs(snappedCanvasY - bounds.bottom);
          const anchorCanvasY = isTopEdge ? bounds.top : bounds.bottom;
          let lineYClient = graphToClient(canvas, bounds.left, anchorCanvasY).y;
          if (!isTopEdge) lineYClient -= borderW;
          appendLine(left, lineYClient, width, borderW, guideColor);
        } else {
          appendLine(left, top, width, borderW, guideColor);
          appendLine(left, top + height - borderW, width, borderW, guideColor);
        }
      }
    }
  }
}

function renderResizeDebugHud(canvas) {
  const s = canvas && canvas.__blockSpaceResizeDebugStatus;
  if (!s || !s.active) {
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
    pulse = {
      node: node,
      hadBoxcolor: Object.prototype.hasOwnProperty.call(node, "boxcolor"),
      boxcolor: node.boxcolor,
      expiresAt: now + pulseMs,
    };
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

function clearSnapFeedbackState(canvas, removeLayer) {
  if (!canvas || !canvas.__blockSpaceSnapFeedbackState) return;
  const state = canvas.__blockSpaceSnapFeedbackState;
  const pulses = state.pulses || {};
  for (const key in pulses) {
    const pulse = pulses[key];
    if (!pulse || !pulse.node) continue;
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
    clearSnapFeedbackState(canvas, true);
    return;
  }
  const state = ensureSnapFeedbackState(canvas);
  if (!state) return;
  const now = Date.now();
  const pulses = state.pulses || {};
  for (const key in pulses) {
    const pulse = pulses[key];
    if (!pulse || !pulse.node || !getNodeBounds(pulse.node)) {
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

function initNodeSnappingPatches() {
  if (typeof window.LGraphCanvas === "undefined" || !window.LGraphCanvas.prototype) {
    return;
  }
  if (window.LGraphCanvas.prototype.__blockSpaceNodeSnapPatched) {
    return;
  }

  V1State.originalProcessMouseMove = window.LGraphCanvas.prototype.processMouseMove;
  V1State.originalProcessMouseUp = window.LGraphCanvas.prototype.processMouseUp;

  window.LGraphCanvas.prototype.processMouseMove = function(event) {
    if (!this.__blockSpaceResetPersistedHighlightDone) {
      resetPersistedHighlightArtifacts(this);
      this.__blockSpaceResetPersistedHighlightDone = true;
    }

    let dragSnapshot = null;
    if (this.node_dragged || (this.last_mouse_dragging && this.current_node)) {
      const primary = this.node_dragged || this.current_node;
      if (primary && primary.pos) {
        dragSnapshot = { anchor: primary, anchorX: primary.pos[0], anchorY: primary.pos[1], nodes: [] };
        if (this.selected_nodes) {
          for (const id in this.selected_nodes) {
            const n = this.selected_nodes[id];
            if (n && n.pos && n !== primary) dragSnapshot.nodes.push({ node: n, x: n.pos[0], y: n.pos[1] });
          }
        }
      }
    }

    const resizingNodeBefore = this.resizing_node || null;
    const result = V1State.originalProcessMouseMove.apply(this, arguments);
    if (event && typeof event.canvasX === "number") this.__blockSpaceCursorX = event.canvasX;
    else if (event && typeof event.clientX === "number") this.__blockSpaceCursorX = event.clientX;
    if (event && typeof event.canvasY === "number") this.__blockSpaceCursorY = event.canvasY;
    else if (event && typeof event.clientY === "number") this.__blockSpaceCursorY = event.clientY;

    if ((event && event.shiftKey) || !isSnappingEnabled()) {
      renderResizeDebugHud(this);
      updateSnapFeedback(this);
      return result;
    }

    const resizingNode = this.resizing_node || resizingNodeBefore;
    if (resizingNode && resizingNode.pos && resizingNode.size && !this.dragging_canvas) {
      const resizeDelta = getResizeDelta(this, resizingNode);
      applyResizeSnapping(this, resizingNode, "both", resizeDelta);
      updateSnapFeedback(this);
      renderResizeDebugHud(this);
      return result;
    }
    this.__blockSpaceResizeDebugStatus = null;
    renderResizeDebugHud(this);
    this.__blockSpacePrevResizeSize = null;
    this.__blockSpaceResizeAxisLock = null;
    this.__blockSpaceResizeDimensionMemory = null;
    this.__blockSpaceMoveYPointMemory = null;

    const activeNode = getActiveDraggedNode(this, event);
    if (!activeNode || (activeNode.constructor && activeNode.constructor.name === "LGraphGroup")) {
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

    const originalX = activeNode.pos[0];
    const originalY = activeNode.pos[1];
    const hSnapMargin = getHSnapMargin();
    const vSnapMargin = getVSnapMargin();
    const baseMoveThreshold = SNAP_THRESHOLD / Math.max(0.0001, getCanvasScale(this));
    const exitThresholdCanvas = baseMoveThreshold * EXIT_THRESHOLD_MULTIPLIER;
    const thresholdCanvasX = baseMoveThreshold * getMoveSnapStrength();
    const thresholdCanvasY = baseMoveThreshold * getMoveSnapStrength();

    const recentSnap = this.__blockSpaceRecentSnap;
    const wasSnappedX = recentSnap && recentSnap.kind === "move" && recentSnap.nodeId === activeNode.id && recentSnap.xDidSnap;
    const wasSnappedY = recentSnap && recentSnap.kind === "move" && recentSnap.nodeId === activeNode.id && recentSnap.yDidSnap;

    const currentThresholdX = wasSnappedX ? (exitThresholdCanvas * getMoveSnapStrength()) : thresholdCanvasX;
    const currentThresholdY = wasSnappedY ? (exitThresholdCanvas * getMoveSnapStrength()) : thresholdCanvasY;

    const nodes = getGraphNodes(this);
    const selectedNodesMap = this.selected_nodes || null;
    let didSnap = false;
    let xDidSnapMove = false;
    let yDidSnapMove = false;

    // X Axis Snapping
    const moveXMemory = ensureMoveXPointMemory(this, activeNode, hSnapMargin);
    const moveXClusters = moveXMemory ? buildDimensionClusters(moveXMemory.points, moveXMemory.tolerancePx) : [];
    const xWinner = pickNearestMoveCluster(moveXClusters, activeBounds.left);

    let xMode = null;
    let xTarget = null;
    let xDelta = Infinity;
    const xWinnerNodes = [];

    if (xWinner) {
      xDelta = Math.abs(activeBounds.left - xWinner.center);
      xTarget = xWinner.center;
      xMode = "left_flush";
      const xNodeSeen = {};
      for (let xm = 0; xm < xWinner.members.length; xm++) {
        const m = xWinner.members[xm];
        if (m.type === "right_flush" || m.type === "stack_right") xMode = "right_flush";
        else if (m.type === "center_flush") xMode = "center_flush";

        if (m.node && m.node.id != null && !xNodeSeen[m.node.id]) {
          xNodeSeen[m.node.id] = true;
          xWinnerNodes.push(m.node);
        }
      }
    }

    if (xWinner && xDelta <= currentThresholdX) {
      activeNode.pos[0] = xTarget;
      didSnap = true;
      xDidSnapMove = true;
    }

    // Y Axis Snapping
    const moveYMemory = ensureMoveYPointMemory(this, activeNode, vSnapMargin);
    const moveYClusters = buildDimensionClusters(moveYMemory ? moveYMemory.points : [], moveYMemory ? moveYMemory.tolerancePx : 12);
    const topWinner = pickNearestMoveCluster(moveYClusters, activeBounds.top);
    const bottomWinner = pickNearestMoveCluster(moveYClusters, activeBounds.bottom);
    const topDelta = topWinner ? Math.abs(activeBounds.top - topWinner.center) : Infinity;
    const bottomDelta = bottomWinner ? Math.abs(activeBounds.bottom - bottomWinner.center) : Infinity;

    let moveYWinner = null;
    let moveYTarget = null;
    let moveYDelta = Infinity;
    let moveYLine = null;

    if (topWinner || bottomWinner) {
      const topBias = 2;
      if (topWinner && (!bottomWinner || (topDelta <= (bottomDelta + topBias)))) {
        moveYWinner = topWinner; moveYDelta = topDelta; moveYLine = topWinner.center; moveYTarget = topWinner.center;
      } else {
        moveYWinner = bottomWinner; moveYDelta = bottomDelta; moveYLine = bottomWinner.center; moveYTarget = bottomWinner.center - (activeBounds.bottom - activeBounds.top);
      }
    }

    const moveYWinnerNodes = [];
    if (moveYWinner && Array.isArray(moveYWinner.members)) {
      const yNodeSeen = {};
      for (let ym = 0; ym < moveYWinner.members.length; ym++) {
        const yNode = moveYWinner.members[ym].node;
        if (yNode && yNode.id != null && !yNodeSeen[yNode.id]) {
          yNodeSeen[yNode.id] = true;
          moveYWinnerNodes.push(yNode);
        }
      }
    }

    if (moveYWinner && moveYDelta <= currentThresholdY) {
      activeNode.pos[1] = moveYTarget;
      didSnap = true;
      yDidSnapMove = true;
    }

    if (dragSnapshot && dragSnapshot.anchor === activeNode) {
      const totalMoveX = activeNode.pos[0] - dragSnapshot.anchorX;
      const totalMoveY = activeNode.pos[1] - dragSnapshot.anchorY;
      for (let i = 0; i < dragSnapshot.nodes.length; i++) {
        const entry = dragSnapshot.nodes[i];
        if (entry.node && entry.node.pos) {
          entry.node.pos[0] = entry.x + totalMoveX;
          entry.node.pos[1] = entry.y + totalMoveY;
        }
      }
    }

    this.__blockSpaceResizeDebugStatus = {
      active: true, axis: "move",
      xWinnerNodes: xWinnerNodes,
      xDidSnap: xDidSnapMove, xMode: xMode, xTarget: xTarget,
      yWinnerNodes: moveYWinnerNodes,
      yDidSnap: yDidSnapMove, yTarget: moveYTarget, yLine: moveYLine,
      didSnap: didSnap,
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

  // processMouseUp is handled in the unified handler later

  window.LGraphCanvas.prototype.__blockSpaceNodeSnapPatched = true;
  window.BlockSpaceNodeSnap = window.BlockSpaceNodeSnap || {};
  window.BlockSpaceNodeSnap.resetPersistedHighlightArtifacts = function(canvas) {
    const targetCanvas = canvas || (window.app && window.app.canvas) || null;
    resetPersistedHighlightArtifacts(targetCanvas);
  };
  window.BlockSpaceNodeSnap.getHSnapMargin = getHSnapMargin;
  window.BlockSpaceNodeSnap.getVSnapMargin = getVSnapMargin;
}
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
  computeWinningXCandidate,
  getSettingValue,
  getHSnapMargin,
  getVSnapMargin,
  getSnapThreshold,
  isSnappingEnabled,
  getMoveSnapStrength,
  getResizeSnapStrength,
  getMoveYSnapStrength,
  getDimensionTolerancePx,
  getHighlightEnabled,
  getHighlightColor,
  getFeedbackEnabled,
  getFeedbackPulseMs,
  getFeedbackColorX,
  getFeedbackColorY,
  getFeedbackColorXY,
} from './core-math.js';

// ============================================================================
// Constants
// ============================================================================

const SNAP_THRESHOLD = 10;
const EXIT_THRESHOLD_MULTIPLIER = 1.5;
const SNAP_MOUSEUP_GRACE_MS = 220;
const SNAP_MOUSEUP_TOLERANCE_MULTIPLIER = 1.8;
const DIMENSION_ASSOC_LAYER_ID = "block-space-dimension-association-layer";
const CONNECTOR_FAN_SPACING = 8;

// ============================================================================
// State Storage for Original Methods
// ============================================================================

const V1State = {
  // Node Snapping
  originalProcessMouseMove: null,
  originalProcessMouseUp: null,
  // Connection Focus
  originalProcessMouseDown: null,
  originalRenderLink: null,
  originalDrawNodeCF: null,
  // Smart Drop
  // (shares processMouseUp with snapping)
  // Smart Sizing
  originalComputeSize: null,
  originalSetSize: null,
  originalConfigure: null,
  originalGraphAdd: null,
  originalDrawNodeSS: null,
};

// ============================================================================
// Section 1: Node Snapping Adapter
// ============================================================================

function getCanvasScale(canvas) {
  const scale = canvas && canvas.ds ? Number(canvas.ds.scale) : 1;
  return isFinite(scale) && scale > 0 ? scale : 1;
}

function isLeftMouseDown(event) {
  if (!event) return false;
  const buttons = Number(event.buttons);
  if (isFinite(buttons) && buttons >= 0) {
    return (buttons & 1) === 1;
  }
  const which = Number(event.which);
  return which === 1;
}

function getActiveDraggedNode(canvas, event) {
  if (!canvas) return null;
  if (canvas.dragging_canvas || canvas.resizing_node || canvas.selected_group_resizing) {
    return null;
  }
  if (canvas.node_dragged && canvas.node_dragged.pos && canvas.node_dragged.size) {
    return canvas.node_dragged;
  }
  if (
    isLeftMouseDown(event) &&
    canvas.last_mouse_dragging &&
    canvas.current_node &&
    canvas.current_node.pos &&
    canvas.current_node.size &&
    !canvas.connecting_node
  ) {
    return canvas.current_node;
  }
  return null;
}

function getGraphNodes(canvas) {
  if (!canvas || !canvas.graph || !Array.isArray(canvas.graph._nodes)) {
    return [];
  }
  return canvas.graph._nodes;
}

function ensureResizeDimensionMemory(canvas, resizingNode) {
  if (!canvas || !resizingNode) return null;
  const memory = canvas.__blockSpaceResizeDimensionMemory;
  if (memory && memory.nodeId === resizingNode.id) {
    return memory;
  }

  const allNodes = getGraphNodes(canvas);
  const activeBounds = getNodeBounds(resizingNode);
  if (!activeBounds) return null;

  const padding = 1500;
  const targetNodes = [];
  for (let nIdx = 0; nIdx < allNodes.length; nIdx++) {
    const n = allNodes[nIdx];
    if (!n || n === resizingNode || (n.constructor && n.constructor.name === "LGraphGroup")) continue;
    const b = getNodeBounds(n);
    if (!b) continue;

    const isNearX = b.right >= (activeBounds.left - padding) && b.left <= (activeBounds.right + padding);
    const isNearY = b.bottom >= (activeBounds.top - padding) && b.top <= (activeBounds.bottom + padding);

    if (isNearX && isNearY) {
      targetNodes.push(n);
    }
  }

  const widthSamples = [];
  const heightSamples = [];
  const rightEdgeSamples = [];
  const bottomEdgeSamples = [];

  const hSnapMargin = getHSnapMargin();
  const vSnapMargin = getVSnapMargin();

  for (let i = 0; i < targetNodes.length; i += 1) {
    const node = targetNodes[i];
    const bounds = getNodeBounds(node);
    if (!bounds) continue;

    const targetWidth = bounds.right - bounds.left;
    const targetHeight = bounds.bottom - bounds.top;
    if (isFinite(targetWidth) && targetWidth > 0) widthSamples.push({ value: targetWidth, node: node });
    if (isFinite(targetHeight) && targetHeight > 0) heightSamples.push({ value: targetHeight, node: node });

    rightEdgeSamples.push({ value: bounds.right, node: node });
    rightEdgeSamples.push({ value: bounds.left, node: node });
    rightEdgeSamples.push({ value: bounds.left - hSnapMargin, node: node });

    bottomEdgeSamples.push({ value: bounds.bottom, node: node });
    bottomEdgeSamples.push({ value: bounds.top, node: node });
    bottomEdgeSamples.push({ value: bounds.top - vSnapMargin, node: node });
  }

  const tolerancePx = getDimensionTolerancePx();
  const newMemory = {
    nodeId: resizingNode.id,
    tolerancePx: tolerancePx,
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
  if (memory && memory.nodeId === activeNode.id) {
    return memory;
  }

  const allNodes = getGraphNodes(canvas);
  const activeBounds = getNodeBounds(activeNode);
  if (!activeBounds) return null;

  const selectedNodesMap = canvas.selected_nodes || null;
  const padding = 1500;
  const points = [];
  const activeHeight = activeBounds.bottom - activeBounds.top;

  for (let nIdx = 0; nIdx < allNodes.length; nIdx++) {
    const node = allNodes[nIdx];
    if (!node || node === activeNode || (node.constructor && node.constructor.name === "LGraphGroup")) continue;
    if (selectedNodesMap && node.id != null && selectedNodesMap[node.id]) continue;

    const bounds = getNodeBounds(node);
    if (!bounds) continue;

    const isNearX = bounds.right >= (activeBounds.left - padding) && bounds.left <= (activeBounds.right + padding);
    const isNearY = bounds.bottom >= (activeBounds.top - padding) && bounds.top <= (activeBounds.bottom + padding);

    if (isNearX && isNearY) {
      points.push({ value: bounds.top, node: node, type: "top_flush" });
      points.push({ value: bounds.bottom - activeHeight, node: node, type: "bottom_flush" });
      points.push({ value: bounds.bottom + vSnapMargin, node: node, type: "stack_below" });
      points.push({ value: bounds.top - vSnapMargin - activeHeight, node: node, type: "stack_above" });
    }
  }

  const newMemory = {
    nodeId: activeNode.id,
    tolerancePx: getDimensionTolerancePx(),
    points: points,
    createdAt: Date.now(),
  };
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
  const padding = 1500;
  const points = [];
  const activeWidth = activeBounds.right - activeBounds.left;

  for (let nIdx = 0; nIdx < allNodes.length; nIdx++) {
    const node = allNodes[nIdx];
    if (!node || node === activeNode || (node.constructor && node.constructor.name === "LGraphGroup")) continue;
    if (selectedNodesMap && node.id != null && selectedNodesMap[node.id]) continue;

    const bounds = getNodeBounds(node);
    if (!bounds) continue;

    const isNearX = bounds.right >= (activeBounds.left - padding) && bounds.left <= (activeBounds.right + padding);
    const isNearY = bounds.bottom >= (activeBounds.top - padding) && bounds.top <= (activeBounds.bottom + padding);

    if (isNearX && isNearY) {
      points.push({ value: bounds.left, node: node, type: "left_flush" });
      points.push({ value: bounds.right - activeWidth, node: node, type: "right_flush" });
      points.push({ value: bounds.left + (bounds.right - bounds.left) * 0.5 - activeWidth * 0.5, node: node, type: "center_flush" });
      points.push({ value: bounds.right + hSnapMargin, node: node, type: "stack_right" });
      points.push({ value: bounds.left - hSnapMargin - activeWidth, node: node, type: "stack_left" });
    }
  }

  const newMemory = {
    nodeId: activeNode.id,
    tolerancePx: getDimensionTolerancePx(),
    points: points,
    createdAt: Date.now(),
  };
  canvas.__blockSpaceMoveXPointMemory = newMemory;
  return newMemory;
}

function getDragDelta(canvas, event) {
  if (!canvas || !event || typeof event.canvasX !== "number" || typeof event.canvasY !== "number") {
    return { dx: 0, dy: 0 };
  }
  const prev = canvas.__blockSpacePrevDragPoint;
  const current = { x: event.canvasX, y: event.canvasY };
  canvas.__blockSpacePrevDragPoint = current;
  if (!prev) {
    return { dx: 0, dy: 0 };
  }
  return {
    dx: current.x - prev.x,
    dy: current.y - prev.y,
  };
}

function getResizeDelta(canvas, node) {
  if (!canvas || !node || !node.size || node.size.length < 2) {
    return { dw: 0, dh: 0 };
  }
  const current = {
    id: node.id != null ? node.id : null,
    w: Number(node.size[0]) || 0,
    h: Number(node.size[1]) || 0,
  };
  const prev = canvas.__blockSpacePrevResizeSize;
  canvas.__blockSpacePrevResizeSize = current;
  if (!prev || prev.id !== current.id) {
    return { dw: 0, dh: 0 };
  }
  return {
    dw: current.w - prev.w,
    dh: current.h - prev.h,
  };
}

function getNodeMinSize(node) {
  let minWidth = 10;
  let minHeight = 10;
  if (!node) {
    return [minWidth, minHeight];
  }

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
      const computed = node.computeSize(node.size && node.size.length >= 1 ? node.size[0] : undefined);
      if (computed && computed.length >= 2) {
        minWidth = Math.max(minWidth, Number(computed[0]) || minWidth);
        minHeight = Math.max(minHeight, Number(computed[1]) || minHeight);
      }
    } catch (error) {
      // Ignore
    }
  }

  return [minWidth, minHeight];
}

function applyResizeSnapping(canvas, resizingNode, resizeAxisLock, resizeDelta) {
  if (!canvas || !resizingNode || (resizingNode.constructor && resizingNode.constructor.name === "LGraphGroup")) {
    return false;
  }

  const bounds = getNodeBounds(resizingNode);
  if (!bounds) return false;

  const thresholdCanvas = (SNAP_THRESHOLD / Math.max(0.0001, getCanvasScale(canvas))) * getResizeSnapStrength();
  const exitThresholdCanvas = thresholdCanvas * EXIT_THRESHOLD_MULTIPLIER;
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
  const status = {
    active: true,
    node: resizingNode && (resizingNode.title || resizingNode.type || resizingNode.id),
    axis: resizeAxisLock || "both",
    activeLeft: bounds.left,
    activeTop: bounds.top,
    xThreshold: thresholdCanvas,
    xReference: currentWidth,
    yThreshold: thresholdCanvas,
    yReference: currentHeight,
    xWinnerNodes: [],
    yWinnerNodes: [],
    xDidSnap: false,
    yDidSnap: false,
    didSnap: false,
  };

  let bestXWidth = null;
  let bestXDelta = Infinity;
  let bestXMode = null;
  let bestXNodes = [];

  if (widthWinner) {
    bestXDelta = Math.abs(currentWidth - widthWinner.center);
    bestXWidth = widthWinner.center;
    bestXMode = "dimension_match";
    bestXNodes = widthWinner.members.map(function(m) { return m.node; }).filter(n => !!n);
  }

  if (rightEdgeWinner) {
    const edgeDelta = Math.abs(currentRight - rightEdgeWinner.center);
    if (edgeDelta < (bestXDelta - 2)) {
      bestXDelta = edgeDelta;
      bestXWidth = rightEdgeWinner.center - bounds.left;
      bestXMode = "edge_align_right";
      bestXNodes = rightEdgeWinner.members.map(function(m) { return m.node; }).filter(n => !!n);
    }
  }

  status.xMode = bestXMode;
  status.xWinnerNodes = bestXNodes;

  const recentSnap = canvas.__blockSpaceRecentSnap;
  const wasSnappedX = recentSnap && recentSnap.kind === "resize" && recentSnap.nodeId === resizingNode.id && recentSnap.xDidSnap;
  const currentThresholdX = wasSnappedX ? exitThresholdCanvas : thresholdCanvas;

  if (bestXWidth !== null && bestXDelta <= currentThresholdX) {
    const nextWidth = Math.max(minSize[0], bestXWidth);
    if (isFinite(nextWidth) && Math.abs(nextWidth - currentWidth) > 0.01) {
      resizingNode.size[0] = nextWidth;
      didSnap = true;
      status.xDidSnap = true;
      status.xTarget = bestXWidth;
      status.xDelta = bestXDelta;
    }
  }

  let bestYHeight = null;
  let bestYDelta = Infinity;
  let bestYMode = null;
  let bestYNodes = [];
  const titleH = Number(window.LiteGraph && window.LiteGraph.NODE_TITLE_HEIGHT) || 24;

  if (heightWinner) {
    bestYDelta = Math.abs(currentHeight - heightWinner.center);
    bestYHeight = heightWinner.center;
    bestYMode = "dimension_match";
    bestYNodes = heightWinner.members.map(function(m) { return m.node; }).filter(n => !!n);
  }

  if (bottomEdgeWinner) {
    const edgeDeltaY = Math.abs(currentBottom - bottomEdgeWinner.center);
    if (edgeDeltaY < (bestYDelta - 2)) {
      bestYDelta = edgeDeltaY;
      bestYHeight = bottomEdgeWinner.center - bounds.top;
      bestYMode = "edge_align_bottom";
      bestYNodes = bottomEdgeWinner.members.map(function(m) { return m.node; }).filter(n => !!n);
    }
  }

  status.yMode = bestYMode;
  status.yWinnerNodes = bestYNodes;

  const wasSnappedY = recentSnap && recentSnap.kind === "resize" && recentSnap.nodeId === resizingNode.id && recentSnap.yDidSnap;
  const currentThresholdY = wasSnappedY ? exitThresholdCanvas : thresholdCanvas;

  if (bestYHeight !== null && bestYDelta <= currentThresholdY) {
    const nextContentHeight = Math.max(minSize[1], bestYHeight - titleH);
    if (isFinite(nextContentHeight) && Math.abs(nextContentHeight - resizingNode.size[1]) > 0.01) {
      resizingNode.size[1] = nextContentHeight;
      didSnap = true;
      status.yDidSnap = true;
      status.yTarget = bestYHeight;
      status.yDelta = bestYDelta;
    }
  }

  status.didSnap = didSnap;
  canvas.__blockSpaceResizeDebugStatus = status;

  if (didSnap) {
    rememberRecentSnap(canvas, {
      kind: "resize",
      nodeId: resizingNode.id,
      threshold: thresholdCanvas,
      xDidSnap: !!status.xDidSnap,
      yDidSnap: !!status.yDidSnap,
      xTargetRight: status.xDidSnap ? bounds.left + status.xTarget : null,
      yTargetBottom: status.yDidSnap ? bounds.top + status.yTarget : null,
    });
    triggerSnapFeedback(canvas, resizingNode, !!status.xDidSnap, !!status.yDidSnap, false);
  }
  return didSnap;
}

function clearSnapVisual(canvas) {
  if (!canvas || !canvas.__blockSpaceWinnerHighlight) {
    return;
  }
  canvas.__blockSpaceWinnerHighlight = null;
  canvas.dirty_canvas = true;
  canvas.dirty_bgcanvas = true;
}

function resetPersistedHighlightArtifacts(canvas) {
  clearSnapFeedbackState(canvas, true);
  if (!canvas) return;
  const nodes = getGraphNodes(canvas);
  let changed = false;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node || (node.constructor && node.constructor.name === "LGraphGroup")) continue;
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
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i] && nodes[i].id === id) {
      return nodes[i];
    }
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
  if (!node || (node.constructor && node.constructor.name === "LGraphGroup") || !node.pos || !node.size) return false;

  const bounds = getNodeBounds(node);
  if (!bounds) return false;

  const tolerance = Math.max(2, (Number(snap.threshold) || 0) * SNAP_MOUSEUP_TOLERANCE_MULTIPLIER);
  let appliedX = false;
  let appliedY = false;

  if (snap.kind === "move") {
    if (snap.xDidSnap && typeof snap.xTarget === "number" && Math.abs(bounds.left - snap.xTarget) <= tolerance) {
      node.pos[0] = snap.xTarget;
      appliedX = true;
    }
    if (snap.yDidSnap && typeof snap.yTarget === "number" && Math.abs(bounds.top - snap.yTarget) <= tolerance) {
      node.pos[1] = snap.yTarget;
      appliedY = true;
    }
  } else if (snap.kind === "resize") {
    const minSize = getNodeMinSize(node);
    const titleH = Number(window.LiteGraph && window.LiteGraph.NODE_TITLE_HEIGHT) || 24;
    if (snap.xDidSnap && typeof snap.xTargetRight === "number" && Math.abs(bounds.right - snap.xTargetRight) <= tolerance) {
      node.size[0] = Math.max(minSize[0], snap.xTargetRight - bounds.left);
      appliedX = true;
    }
    if (snap.yDidSnap && typeof snap.yTargetBottom === "number" && Math.abs(bounds.bottom - snap.yTargetBottom) <= tolerance) {
      node.size[1] = Math.max(minSize[1], (snap.yTargetBottom - bounds.top) - titleH);
      appliedY = true;
    }
  }

  if (appliedX || appliedY) {
    triggerSnapFeedback(canvas, node, appliedX, appliedY, snap.kind === "move");
    return true;
  }
  return false;
}

function ensureDimensionAssociationLayer() {
  let layer = document.getElementById(DIMENSION_ASSOC_LAYER_ID);
  if (layer) return layer;
  layer = document.createElement("div");
  layer.id = DIMENSION_ASSOC_LAYER_ID;
  layer.style.position = "fixed";
  layer.style.left = "0";
  layer.style.top = "0";
  layer.style.width = "100vw";
  layer.style.height = "100vh";
  layer.style.pointerEvents = "none";
  layer.style.zIndex = "9999";
  document.body.appendChild(layer);
  return layer;
}

function clearDimensionAssociationLayer() {
  const layer = document.getElementById(DIMENSION_ASSOC_LAYER_ID);
  if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
}

function graphToClient(canvas, x, y) {
  if (!canvas || !canvas.canvas) return null;
  const rect = canvas.canvas.getBoundingClientRect();
  const scale = getCanvasScale(canvas);
  const offset = canvas.ds && canvas.ds.offset ? canvas.ds.offset : [0, 0];
  return {
    x: rect.left + (x + (Number(offset[0]) || 0)) * scale,
    y: rect.top + (y + (Number(offset[1]) || 0)) * scale,
  };
}

function renderDimensionAssociationHighlights(canvas, status) {
  const layer = ensureDimensionAssociationLayer();
  if (!layer) return;
  while (layer.firstChild) layer.removeChild(layer.firstChild);
  if (!canvas || !status || !status.active) return;

  const scale = getCanvasScale(canvas);
  const borderW = 2;
  const guideColor = getHighlightColor();

  function appendLine(x, y, w, h, color) {
    const line = document.createElement("div");
    line.style.position = "fixed";
    line.style.left = Math.round(x) + "px";
    line.style.top = Math.round(y) + "px";
    line.style.width = Math.max(0, Math.round(w)) + "px";
    line.style.height = Math.max(0, Math.round(h)) + "px";
    line.style.border = borderW + "px dotted " + color;
    line.style.boxSizing = "border-box";
    line.style.opacity = "0.95";
    layer.appendChild(line);
  }

  const nodeMap = {};
  function trackNode(node, axis) {
    if (!node || node.id == null) return;
    const key = String(node.id);
    if (!nodeMap[key]) nodeMap[key] = { node: node, width: false, height: false };
    nodeMap[key][axis] = true;
  }

  const xNodes = status.xDidSnap ? (status.xWinnerNodes || []) : [];
  const yNodes = status.yDidSnap ? (status.yWinnerNodes || []) : [];
  for (let i = 0; i < xNodes.length; i++) trackNode(xNodes[i], "width");
  for (let j = 0; j < yNodes.length; j++) trackNode(yNodes[j], "height");

  for (const key in nodeMap) {
    if (!Object.prototype.hasOwnProperty.call(nodeMap, key)) continue;
    const item = nodeMap[key];
    const bounds = getNodeBounds(item.node);
    if (!bounds) continue;
    const topLeft = graphToClient(canvas, bounds.left, bounds.top);
    if (!topLeft) continue;
    const left = topLeft.x;
    const top = topLeft.y;
    const width = Math.max(0, (bounds.right - bounds.left) * scale);
    const height = Math.max(0, (bounds.bottom - bounds.top) * scale);

    if (item.width) {
      if (status.axis === "move") {
        const xMode = status.xMode || "";
        const anchorCanvasX = xMode.indexOf("right") !== -1 ? bounds.right : (xMode.indexOf("center") !== -1 ? bounds.left + (bounds.right - bounds.left) / 2 : bounds.left);
        const lineXClient = graphToClient(canvas, anchorCanvasX, bounds.top).x;
        if (xMode.indexOf("right") !== -1) lineXClient -= borderW;
        appendLine(lineXClient, top, borderW, height, guideColor);
      } else {
        if (status.xMode === "edge_align_right") {
          const snappedCanvasX = status.activeLeft + status.xTarget;
          const isLeftEdge = Math.abs(snappedCanvasX - bounds.left) < Math.abs(snappedCanvasX - bounds.right);
          const anchorCanvasX = isLeftEdge ? bounds.left : bounds.right;
          let lineXClient = graphToClient(canvas, anchorCanvasX, bounds.top).x;
          if (!isLeftEdge) lineXClient -= borderW;
          appendLine(lineXClient, top, borderW, height, guideColor);
        } else {
          appendLine(left, top, borderW, height, guideColor);
          appendLine(left + width - borderW, top, borderW, height, guideColor);
        }
      }
    }
    if (item.height) {
      if (status.axis === "move") {
        const snapLineY = status.yLine;
        const isTopEdge = Math.abs(snapLineY - bounds.top) < Math.abs(snapLineY - bounds.bottom);
        const anchorCanvasY = isTopEdge ? bounds.top : bounds.bottom;
        let lineYClient = graphToClient(canvas, bounds.left, anchorCanvasY).y;
        if (!isTopEdge) lineYClient -= borderW;
        appendLine(left, lineYClient, width, borderW, guideColor);
      } else {
        if (status.yMode === "edge_align_bottom") {
          const snappedCanvasY = status.activeTop + status.yTarget;
          const isTopEdge = Math.abs(snappedCanvasY - bounds.top) < Math.abs(snappedCanvasY - bounds.bottom);
          const anchorCanvasY = isTopEdge ? bounds.top : bounds.bottom;
          let lineYClient = graphToClient(canvas, bounds.left, anchorCanvasY).y;
          if (!isTopEdge) lineYClient -= borderW;
          appendLine(left, lineYClient, width, borderW, guideColor);
        } else {
          appendLine(left, top, width, borderW, guideColor);
          appendLine(left, top + height - borderW, width, borderW, guideColor);
        }
      }
    }
  }
}

function renderResizeDebugHud(canvas) {
  const s = canvas && canvas.__blockSpaceResizeDebugStatus;
  if (!s || !s.active) {
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
    pulse = {
      node: node,
      hadBoxcolor: Object.prototype.hasOwnProperty.call(node, "boxcolor"),
      boxcolor: node.boxcolor,
      expiresAt: now + pulseMs,
    };
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

function clearSnapFeedbackState(canvas, removeLayer) {
  if (!canvas || !canvas.__blockSpaceSnapFeedbackState) return;
  const state = canvas.__blockSpaceSnapFeedbackState;
  const pulses = state.pulses || {};
  for (const key in pulses) {
    const pulse = pulses[key];
    if (!pulse || !pulse.node) continue;
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
    clearSnapFeedbackState(canvas, true);
    return;
  }
  const state = ensureSnapFeedbackState(canvas);
  if (!state) return;
  const now = Date.now();
  const pulses = state.pulses || {};
  for (const key in pulses) {
    const pulse = pulses[key];
    if (!pulse || !pulse.node || !getNodeBounds(pulse.node)) {
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
// Section 2: Connection Focus Adapter
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
  if (canvas && typeof canvas.setDirty === "function") {
    canvas.setDirty(true, true);
  }
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
  if (!canvas || !canvas.graph || typeof canvas.graph.getNodeOnPos !== "function" || !event) {
    return null;
  }
  if (typeof canvas.adjustMouseEvent === "function") {
    canvas.adjustMouseEvent(event);
  }
  if (typeof event.canvasX !== "number" || typeof event.canvasY !== "number") {
    return null;
  }
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
  links.sort(function (a, b) {
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
    const laneOffset = (i - center) * CONNECTOR_FAN_SPACING;
    byKey[String(links[i].key)] = laneOffset;
  }
}

function getActiveFocus(canvas) {
  if (!focusState.isHolding || !canvas || focusState.activeCanvas !== canvas || focusState.activeNodeId == null) {
    return null;
  }
  if (!canvas.graph || typeof canvas.graph.getNodeById !== "function") {
    return null;
  }

  const graph = canvas.graph;
  const activeNode = graph.getNodeById(focusState.activeNodeId);
  if (!activeNode) return null;

  const connectedNodeIds = {};
  const connectedLinkIds = {};
  const targetInputsByNode = {};
  const sourceOutputSlotsByNode = {};
  const activeOutputSlots = {};
  const activeInputSlots = {};
  const outgoingGroups = {};
  const incomingGroups = {};
  const linkLaneOffsets = {};

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

        if (!targetInputsByNode[link.target_id]) {
          targetInputsByNode[link.target_id] = {};
        }
        targetInputsByNode[link.target_id][link.target_slot] = true;

        const outGroupKey = String(link.origin_slot);
        if (!outgoingGroups[outGroupKey]) {
          outgoingGroups[outGroupKey] = [];
        }
        outgoingGroups[outGroupKey].push({
          key: linkKey,
          peerNodeId: link.target_id,
          peerSlot: link.target_slot,
        });
      }

      if (link.target_id === activeNode.id) {
        connectedNodeIds[link.origin_id] = true;
        connectedLinkIds[linkKey] = true;
        activeInputSlots[link.target_slot] = true;

        if (!sourceOutputSlotsByNode[link.origin_id]) {
          sourceOutputSlotsByNode[link.origin_id] = {};
        }
        sourceOutputSlotsByNode[link.origin_id][link.origin_slot] = true;

        const inGroupKey = String(link.target_slot);
        if (!incomingGroups[inGroupKey]) {
          incomingGroups[inGroupKey] = [];
        }
        incomingGroups[inGroupKey].push({
          key: linkKey,
          peerNodeId: link.origin_id,
          peerSlot: link.origin_slot,
        });
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
    activeNodeId: activeNode.id,
    connectedNodeIds: connectedNodeIds,
    connectedLinkIds: connectedLinkIds,
    targetInputsByNode: targetInputsByNode,
    sourceOutputSlotsByNode: sourceOutputSlotsByNode,
    activeOutputSlots: activeOutputSlots,
    activeInputSlots: activeInputSlots,
    linkLaneOffsets: linkLaneOffsets,
    animationTime: focusState.animationTime,
  };
}

function getSlotColor(node, isInput, slotIndex) {
  if (!node) return null;
  const slots = isInput ? node.inputs : node.outputs;
  if (slots && slots[slotIndex]) {
    const slot = slots[slotIndex];
    if (typeof slot.color === "string" && slot.color) {
      return slot.color;
    }
    if (slot.type && typeof slot.type === "string") {
      const slotType = slot.type;
      const lg = window.LiteGraph;
      if (lg && lg.type_colors && lg.type_colors[slotType]) {
        return lg.type_colors[slotType];
      }
      const constName = slotType.toUpperCase() + "_COLOR";
      if (lg && lg[constName]) {
        return lg[constName];
      }
      const typeMap = {
        "MODEL": "#B39DDB",
        "CLIP": "#FFD166",
        "VAE": "#FF6B6B",
        "LATENT": "#FF6B9D",
        "IMAGE": "#4ECDC4",
        "MASK": "#95E1D3",
        "CONDITIONING": "#FFA07A",
        "FLOAT": "#AAEE88",
        "INT": "#AAEE88",
        "STRING": "#F7DC6F",
        "BOOLEAN": "#87CEEB",
      };
      if (typeMap[slotType]) {
        return typeMap[slotType];
      }
    }
  }
  return null;
}

function drawFlowOverlay(canvas, argsLike, animationTime, sourceOffset, targetOffset) {
  if (!canvas || !argsLike || !argsLike.length) return;
  const ctx = argsLike[0];
  if (!ctx || typeof ctx.setLineDash !== "function") return;

  const a = argsLike[1];
  const b = argsLike[2];
  if (!a || !b || a.length < 2 || b.length < 2) return;

  const ax = a[0];
  const ay = a[1];
  const bx = b[0];
  const by = b[1];
  const settings = getFocusSettings();
  const flowColor = "#ffffff";
  const dashOffset = -((animationTime || 0) * 0.028);
  const prevLineWidth = ctx.lineWidth || 1;
  const stub = settings.connectorStubLength;

  ctx.save();
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = Math.max(1.2, prevLineWidth + 0.4);
  ctx.strokeStyle = flowColor;
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
  if (!pos || pos.length < 2) return;

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
  if (!argsLike || !argsLike.length) return;
  const ctx = argsLike[0];
  if (!ctx) return;
  const a = argsLike[1];
  const b = argsLike[2];
  if (!a || !b || a.length < 2 || b.length < 2) return;

  const ax = a[0];
  const ay = a[1];
  const bx = b[0];
  const by = b[1];
  const settings = getFocusSettings();
  const stub = settings.connectorStubLength;

  ctx.save();
  if (color) ctx.strokeStyle = color;
  ctx.lineJoin = "miter";
  ctx.lineCap = "round";
  drawConfiguredPath(ctx, ax, ay, bx, by, stub, settings.connectorStyle, sourceOffset || 0, targetOffset || 0);
  ctx.stroke();
  ctx.restore();
}

function drawConfiguredPath(ctx, ax, ay, bx, by, stub, style, sourceOffset, targetOffset) {
  const so = Number(sourceOffset) || 0;
  const to = Number(targetOffset) || 0;
  if (style === "straight") {
    drawStraightPath(ctx, ax, ay, bx, by, stub, so, to);
    return;
  }
  if (style === "angled") {
    drawAngledPath(ctx, ax, ay, bx, by, stub, so, to);
    return;
  }
  drawHybridPath(ctx, ax, ay, bx, by, stub);
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

function initConnectionFocusPatches() {
  if (typeof window.LGraphCanvas === "undefined" || !window.LGraphCanvas.prototype) {
    console.error("[ConnectionFocus] LGraphCanvas is unavailable.");
    return;
  }
  if (window.LGraphCanvas.prototype.__connectionFocusPatched) {
    return;
  }

  V1State.originalProcessMouseDown = window.LGraphCanvas.prototype.processMouseDown;
  V1State.originalRenderLink = window.LGraphCanvas.prototype.renderLink;
  V1State.originalDrawNodeCF = window.LGraphCanvas.prototype.drawNode;

  window.LGraphCanvas.prototype.processMouseDown = function (event) {
    const isLeft = isLeftPointer(event);
    const nodeBefore = isLeft ? getNodeAtEvent(this, event) : null;
    const result = V1State.originalProcessMouseDown.apply(this, arguments);

    if (!getFocusSettings().enabled) return result;

    if (!isLeft) {
      clearFocusState();
      return result;
    }

    let node = nodeBefore || getNodeAtEvent(this, event) || this.node_over || null;
    if (!node && this.selected_nodes) {
      for (const nodeId in this.selected_nodes) {
        if (Object.prototype.hasOwnProperty.call(this.selected_nodes, nodeId)) {
          node = this.selected_nodes[nodeId];
          break;
        }
      }
    }

    if (node && node.id != null) {
      setFocusState(this, node.id);
    } else {
      clearFocusState();
    }

    return result;
  };

  window.LGraphCanvas.prototype.renderLink = function (ctx, a, b) {
    if (!getFocusSettings().enabled) {
      return V1State.originalRenderLink.apply(this, arguments);
    }

    const link = extractLinkInfo(arguments);
    if (!link) {
      return V1State.originalRenderLink.apply(this, arguments);
    }

    const originNode = this.graph.getNodeById(link.origin_id);
    const slotColor = getSlotColor(originNode, false, link.origin_slot);

    const focus = getActiveFocus(this);
    if (!focus) {
      return drawHardAngleLink(arguments, 0, 0, slotColor);
    }

    const linkKey = link.id != null ? link.id : null;
    let isConnected = false;
    if (linkKey != null && focus.connectedLinkIds[linkKey]) {
      isConnected = true;
    } else if (focus.connectedLinkIds[String(linkKey)]) {
      isConnected = true;
    }
    if (!isConnected) {
      ctx.save();
      ctx.globalAlpha = ctx.globalAlpha * 0.12;
      const dimResult = drawHardAngleLink(arguments, 0, 0, slotColor);
      ctx.restore();
      return dimResult;
    }

    let sourceOffset = 0;
    let targetOffset = 0;
    const style = getFocusSettings().connectorStyle;
    if (style === "straight" || style === "angled") {
      const laneMap = focus.linkLaneOffsets || {};
      const laneKey = linkKey != null ? String(linkKey) : "";
      const laneOffset = Number(laneMap[laneKey]) || 0;
      if (link.origin_id === focus.activeNodeId) {
        sourceOffset = laneOffset;
      } else if (link.target_id === focus.activeNodeId) {
        targetOffset = laneOffset;
      }
    }

    const result = drawHardAngleLink(arguments, sourceOffset, targetOffset, slotColor);
    if (link.origin_id === focus.activeNodeId || link.target_id === focus.activeNodeId) {
      drawFlowOverlay(this, arguments, focus.animationTime || 0, sourceOffset, targetOffset);
    }
    return result;
  };

  if (typeof V1State.originalDrawNodeCF === "function") {
    window.LGraphCanvas.prototype.drawNode = function (node, ctx) {
      if (!getFocusSettings().enabled) {
        return V1State.originalDrawNodeCF.apply(this, arguments);
      }

      const focus = getActiveFocus(this);
      if (!focus || !node) {
        return V1State.originalDrawNodeCF.apply(this, arguments);
      }

      const isActiveNode = node.id === focus.activeNodeId;
      const isConnectedNode = isActiveNode || !!focus.connectedNodeIds[node.id];
      const shouldDimNode = !isConnectedNode;

      let result;
      if (shouldDimNode) {
        const previousEditorAlpha = this.editor_alpha;
        const safeEditorAlpha = typeof previousEditorAlpha === "number" ? previousEditorAlpha : 1;
        this.editor_alpha = safeEditorAlpha * 0.28;
        try {
          result = V1State.originalDrawNodeCF.apply(this, arguments);
        } finally {
          this.editor_alpha = previousEditorAlpha;
        }
        return result;
      }

      result = V1State.originalDrawNodeCF.apply(this, arguments);

      if (isActiveNode) {
        const outputIndices = Object.keys(focus.activeOutputSlots);
        for (let i = 0; i < outputIndices.length; i++) {
          const outColor = getSlotColor(node, false, Number(outputIndices[i])) || getFocusSettings().pulseColor;
          drawSlotRing(node, ctx, false, Number(outputIndices[i]), outColor);
        }

        const inputIndices = Object.keys(focus.activeInputSlots);
        for (let j = 0; j < inputIndices.length; j++) {
          const inColor = getSlotColor(node, true, Number(inputIndices[j])) || getFocusSettings().pulseColor;
          drawSlotRing(node, ctx, true, Number(inputIndices[j]), inColor);
        }
      }

      if (focus.targetInputsByNode[node.id]) {
        const targetInputIndices = Object.keys(focus.targetInputsByNode[node.id]);
        for (let k = 0; k < targetInputIndices.length; k++) {
          const targetColor = getSlotColor(node, true, Number(targetInputIndices[k])) || getFocusSettings().pulseColor;
          drawSlotRing(node, ctx, true, Number(targetInputIndices[k]), targetColor);
        }
      }

      if (focus.sourceOutputSlotsByNode[node.id]) {
        const sourceOutputIndices = Object.keys(focus.sourceOutputSlotsByNode[node.id]);
        for (let l = 0; l < sourceOutputIndices.length; l++) {
          const sourceColor = getSlotColor(node, false, Number(sourceOutputIndices[l])) || getFocusSettings().pulseColor;
          drawSlotRing(node, ctx, false, Number(sourceOutputIndices[l]), sourceColor);
        }
      }

      return result;
    };
  }

  window.addEventListener("blur", function () {
    clearFocusState();
  }, true);

  document.addEventListener("mouseup", function () {
    if (focusState.isHolding) {
      clearFocusState();
    }
  }, true);

  document.addEventListener("keydown", function (event) {
    if (event && event.key === "Escape") {
      clearFocusState();
    }
  }, true);

  window.__connectionFocusState = focusState;
  window.LGraphCanvas.prototype.__connectionFocusPatched = true;
}


// ============================================================================
// Section 3: Smart Drop Adapter
// ============================================================================

let activeMenuCleanup = null;

function splitTypes(typeValue) {
  if (typeValue == null || typeValue === "") return [];
  if (Array.isArray(typeValue)) {
    return typeValue
      .map(function (value) {
        return String(value).trim().toUpperCase();
      })
      .filter(Boolean);
  }
  return String(typeValue)
    .split(/[|,]/)
    .map(function (value) {
      return value.trim().toUpperCase();
    })
    .filter(Boolean);
}

function isWildcardType(typeValue) {
  if (typeValue == null || typeValue === "") return true;
  if (Array.isArray(typeValue)) {
    return typeValue.length === 0 || typeValue.indexOf("*") !== -1;
  }
  return String(typeValue).trim() === "*";
}

function areTypesCompatible(originType, inputType) {
  if (isWildcardType(originType) || isWildcardType(inputType)) return true;
  const originTypes = splitTypes(originType);
  const inputTypes = splitTypes(inputType);
  for (let i = 0; i < originTypes.length; i++) {
    if (inputTypes.indexOf(originTypes[i]) !== -1) return true;
  }
  return false;
}

function captureOriginDragState(canvas) {
  if (!canvas || !canvas.connecting_node) return null;
  const originNode = canvas.connecting_node;
  let originSlotIndex = -1;

  if (typeof canvas.connecting_slot === "number") {
    originSlotIndex = canvas.connecting_slot;
  } else if (typeof canvas.connecting_output === "number") {
    originSlotIndex = canvas.connecting_output;
  } else if (originNode.outputs && canvas.connecting_output) {
    originSlotIndex = originNode.outputs.indexOf(canvas.connecting_output);
  }

  if (originSlotIndex < 0 || !originNode.outputs || !originNode.outputs[originSlotIndex]) {
    return null;
  }

  const originOutput = originNode.outputs[originSlotIndex];
  const linkCountBefore = Array.isArray(originOutput.links) ? originOutput.links.length : 0;

  return {
    originNode: originNode,
    originSlotIndex: originSlotIndex,
    originOutput: originOutput,
    linkCountBefore: linkCountBefore,
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

  const clientX = params.clientX;
  const clientY = params.clientY;
  const matches = params.matches;
  const originNode = params.originNode;
  const originSlotIndex = params.originSlotIndex;
  const targetNode = params.targetNode;
  const canvasElement = params.canvasElement;

  const menu = document.createElement("div");
  menu.className = "smart-drop-menu";
  menu.style.position = "fixed";
  menu.style.left = clientX + 8 + "px";
  menu.style.top = clientY + 8 + "px";
  menu.style.zIndex = "9999";
  menu.style.minWidth = "180px";
  menu.style.background = "#20232a";
  menu.style.color = "#f2f2f2";
  menu.style.border = "1px solid #4a4f59";
  menu.style.borderRadius = "8px";
  menu.style.boxShadow = "0 8px 20px rgba(0,0,0,0.35)";
  menu.style.padding = "6px";
  menu.style.fontFamily = "Arial, sans-serif";
  menu.style.fontSize = "13px";

  const title = document.createElement("div");
  title.textContent = "Select input";
  title.style.padding = "6px 8px";
  title.style.opacity = "0.85";
  title.style.borderBottom = "1px solid #3b4048";
  title.style.marginBottom = "4px";
  menu.appendChild(title);

  matches.forEach(function (match) {
    const item = document.createElement("button");
    item.type = "button";
    item.textContent = match.inputName;
    item.style.display = "block";
    item.style.width = "100%";
    item.style.textAlign = "left";
    item.style.border = "0";
    item.style.borderRadius = "5px";
    item.style.padding = "7px 8px";
    item.style.background = "transparent";
    item.style.color = "#f2f2f2";
    item.style.cursor = "pointer";

    item.addEventListener("mouseenter", function () {
      item.style.background = "#2f3541";
    });

    item.addEventListener("mouseleave", function () {
      item.style.background = "transparent";
    });

    item.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      originNode.connect(originSlotIndex, targetNode, match.inputIndex);
      destroyActiveMenu();
    });

    menu.appendChild(item);
  });

  document.body.appendChild(menu);

  function dismissOnOutsidePointer(event) {
    if (!menu.contains(event.target)) {
      destroyActiveMenu();
    }
  }

  function dismissOnEscape(event) {
    if (event.key === "Escape") {
      destroyActiveMenu();
    }
  }

  window.setTimeout(function () {
    document.addEventListener("pointerdown", dismissOnOutsidePointer, true);
    document.addEventListener("keydown", dismissOnEscape, true);
    if (canvasElement) {
      canvasElement.addEventListener("pointerdown", dismissOnOutsidePointer, true);
    }
  }, 0);

  function removeOutsideListeners() {
    document.removeEventListener("pointerdown", dismissOnOutsidePointer, true);
    document.removeEventListener("keydown", dismissOnEscape, true);
    if (canvasElement) {
      canvasElement.removeEventListener("pointerdown", dismissOnOutsidePointer, true);
    }
  }

  function cleanupMenu() {
    removeOutsideListeners();
    if (menu.parentNode) {
      menu.parentNode.removeChild(menu);
    }
    if (activeMenuCleanup === cleanupMenu) {
      activeMenuCleanup = null;
    }
  }
  activeMenuCleanup = cleanupMenu;
}

function handleSmartDrop(canvas, event, result) {
  // Called from unified processMouseUp
  // Returns true if menu was shown
  const dropCanvasX = event && typeof event.canvasX === "number" ? event.canvasX : null;
  const dropCanvasY = event && typeof event.canvasY === "number" ? event.canvasY : null;
  const dropClientX = event && typeof event.clientX === "number" ? event.clientX : 0;
  const dropClientY = event && typeof event.clientY === "number" ? event.clientY : 0;

  const dragState = captureOriginDragState(canvas);
  const hadActiveDrag = !!dragState;

  if (!hadActiveDrag || !dragState || !dragState.originOutput) {
    return { handled: false, needsMenu: false };
  }

  const currentLinkCount = Array.isArray(dragState.originOutput.links)
    ? dragState.originOutput.links.length
    : 0;

  // If default LiteGraph behavior connected successfully, keep it untouched
  if (currentLinkCount > dragState.linkCountBefore) {
    return { handled: true, needsMenu: false };
  }

  if (!canvas.graph || typeof canvas.graph.getNodeOnPos !== "function") {
    return { handled: false, needsMenu: false };
  }

  if (typeof dropCanvasX !== "number" || typeof dropCanvasY !== "number") {
    return { handled: false, needsMenu: false };
  }

  const targetNode = canvas.graph.getNodeOnPos(dropCanvasX, dropCanvasY);
  if (!targetNode || !Array.isArray(targetNode.inputs) || targetNode.inputs.length === 0) {
    return { handled: false, needsMenu: false };
  }

  const originType = dragState.originOutput.type;

  const validMatches = [];
  for (let i = 0; i < targetNode.inputs.length; i++) {
    const input = targetNode.inputs[i];
    if (!input) continue;

    if (areTypesCompatible(originType, input.type)) {
      validMatches.push({
        inputIndex: i,
        inputName: input.name || "input_" + i,
      });
    }
  }

  if (validMatches.length === 0) {
    return { handled: false, needsMenu: false };
  }

  if (validMatches.length === 1) {
    dragState.originNode.connect(
      dragState.originSlotIndex,
      targetNode,
      validMatches[0].inputIndex
    );
    return { handled: true, needsMenu: false };
  }

  // Multiple matches - show menu
  return {
    handled: true,
    needsMenu: true,
    menuParams: {
      clientX: dropClientX,
      clientY: dropClientY,
      matches: validMatches,
      originNode: dragState.originNode,
      originSlotIndex: dragState.originSlotIndex,
      targetNode: targetNode,
      canvasElement: canvas.canvas,
    }
  };
}

function initSmartDropPatches() {
  if (typeof window.LGraphCanvas === "undefined" || !window.LGraphCanvas.prototype) {
    console.error("[SmartDrop] LGraphCanvas is unavailable.");
    return;
  }
  if (window.LGraphCanvas.prototype.__smartDropPatched) {
    return;
  }
  // processMouseUp is handled in unified handler
  window.LGraphCanvas.prototype.__smartDropPatched = true;
}

// ============================================================================
// Section 4: Smart Sizing Adapter
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

function getNodeFontSize() {
  return (window.LiteGraph && window.LiteGraph.NODE_TEXT_SIZE) || 14;
}

function getNodeFont() {
  return getNodeFontSize() + "px Arial";
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

  let left = 0;
  let right = value.length;
  while (left < right) {
    const mid = Math.ceil((left + right) / 2);
    const candidate = value.slice(0, mid) + ellipsis;
    if (measureTextWidth(candidate) <= maxWidth) {
      left = mid;
    } else {
      right = mid - 1;
    }
  }
  return value.slice(0, left) + ellipsis;
}

function getSlotText(slot) {
  if (!slot) return "";
  return slot.label != null ? slot.label : slot.name || "";
}

function getSlotMaxWidth(slots) {
  if (!Array.isArray(slots) || !slots.length) return 0;
  let maxWidth = 0;
  for (let i = 0; i < slots.length; i++) {
    const text = truncateToWidth(getSlotText(slots[i]), MAX_TEXT_WIDTH);
    const width = Math.min(MAX_TEXT_WIDTH, measureTextWidth(text));
    if (width > maxWidth) maxWidth = width;
  }
  return maxWidth;
}

function getWidgetSize(widget, currentWidth) {
  if (!widget) return [0, 0];

  let size = null;
  if (typeof widget.computeSize === "function") {
    try {
      size = widget.computeSize(currentWidth);
    } catch (error) {
      size = null;
    }
  }

  if (!size || size.length < 2) {
    const options = widget.options || {};
    const widgetWidth = widget.width || options.width || options.w || 0;
    const widgetHeight = widget.height || options.height || options.h || window.LiteGraph.NODE_WIDGET_HEIGHT || 20;
    size = [widgetWidth, widgetHeight];
  }

  const width = Math.max(0, Number(size[0]) || 0);
  const height = Math.max(0, Number(size[1]) || 0);
  return [width, height];
}

function computeWidgetBounds(node, startWidth) {
  const widgets = Array.isArray(node.widgets) ? node.widgets : null;
  if (!widgets || !widgets.length) {
    return { width: 0, height: 0 };
  }

  let maxWidth = 0;
  let totalHeight = 0;
  for (let i = 0; i < widgets.length; i++) {
    const size = getWidgetSize(widgets[i], startWidth);
    if (size[0] > maxWidth) maxWidth = size[0];
    totalHeight += size[1] + 4;
  }
  totalHeight += 8;
  return { width: maxWidth, height: totalHeight };
}

function isNodeBeingResized(node) {
  if (!node || !node.graph || !node.graph.list_of_graphcanvas) return false;
  const canvases = node.graph.list_of_graphcanvas;
  for (let i = 0; i < canvases.length; i++) {
    const canvas = canvases[i];
    if (canvas && canvas.resizing_node === node) return true;
  }
  return false;
}

function applyTruncatedLabelsTemporarily(node) {
  const restorations = [];
  if (!node) return restorations;

  function storeAndAssign(target, key, value) {
    restorations.push({
      target: target,
      key: key,
      hadOwn: Object.prototype.hasOwnProperty.call(target, key),
      previous: target[key],
    });
    target[key] = value;
  }

  storeAndAssign(node, "title", truncateToWidth(node.title || "", MAX_TEXT_WIDTH));

  const slots = [];
  if (Array.isArray(node.inputs)) slots.push(...node.inputs);
  if (Array.isArray(node.outputs)) slots.push(...node.outputs);

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (!slot) continue;
    const truncated = truncateToWidth(getSlotText(slot), MAX_TEXT_WIDTH);
    storeAndAssign(slot, "label", truncated);
    slot.__smartDisplayLabel = truncated;
  }

  return restorations;
}

function restoreTemporaryValues(restorations) {
  if (!restorations || !restorations.length) return;
  for (let i = restorations.length - 1; i >= 0; i--) {
    const item = restorations[i];
    if (!item.hadOwn) {
      delete item.target[item.key];
    } else {
      item.target[item.key] = item.previous;
    }
  }
}

function initSmartSizingPatches() {
  const PATCH_VERSION = "2026-02-25-phase4-fixes-1";

  if (typeof window.LiteGraph === "undefined" || typeof window.LGraphNode === "undefined") {
    console.error("[SmartSizing] LiteGraph is unavailable.");
    return;
  }

  if (window.LGraphNode.prototype.__smartSizingPatched) {
    if (window.LGraphNode.prototype.__smartSizingPatchVersion === PATCH_VERSION) {
      return;
    }
    // Upgrade path: restore originals first, then apply latest patch
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
  V1State.originalGraphAdd = window.LGraph && window.LGraph.prototype ? window.LGraph.prototype.add : null;
  V1State.originalDrawNodeSS = window.LGraphCanvas && window.LGraphCanvas.prototype ? window.LGraphCanvas.prototype.drawNode : null;

  if (typeof V1State.originalComputeSize !== "function" || typeof V1State.originalSetSize !== "function") {
    console.error("[SmartSizing] Required LGraphNode APIs are unavailable.");
    return;
  }

  window.LGraphNode.prototype.computeSize = function (out) {
    const size = out || new Float32Array([0, 0]);
    let rows = Math.max(this.inputs ? this.inputs.length : 1, this.outputs ? this.outputs.length : 1);
    rows = Math.max(rows, 1);

    const maxInputWidth = getSlotMaxWidth(this.inputs);
    const maxOutputWidth = getSlotMaxWidth(this.outputs);
    const clampedTitle = truncateToWidth(this.title || "", MAX_TEXT_WIDTH);
    const titleWidth = Math.min(MAX_TEXT_WIDTH, measureTextWidth(clampedTitle));

    const slotTextWidth = Math.min((MAX_TEXT_WIDTH * 2) + PORT_PADDING, maxInputWidth + maxOutputWidth + PORT_PADDING);
    const titleRequiredWidth = titleWidth + PORT_PADDING;
    const textMinWidth = Math.max(slotTextWidth, titleRequiredWidth, MIN_NODE_WIDTH);

    const widgetBounds = computeWidgetBounds(this, textMinWidth);
    const minWidth = Math.max(textMinWidth, widgetBounds.width);

    const slotStartY = this.constructor.slot_start_y || 0;
    const slotHeight = (window.LiteGraph && window.LiteGraph.NODE_SLOT_HEIGHT) || 20;
    let minHeight = slotStartY + rows * slotHeight;

    if (widgetBounds.height > 0) {
      if (this.widgets_up) {
        minHeight = Math.max(minHeight, widgetBounds.height);
      } else if (this.widgets_start_y != null) {
        minHeight = Math.max(minHeight, widgetBounds.height + this.widgets_start_y);
      } else {
        minHeight += widgetBounds.height;
      }
    }

    if (this.constructor.min_height && minHeight < this.constructor.min_height) {
      minHeight = this.constructor.min_height;
    }
    minHeight += 6;

    const resizing = isNodeBeingResized(this);
    if (!resizing && this.__smartUserSize && this.__smartUserSize.length >= 2) {
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
    if (isNodeBeingResized(this) && this.size && this.size.length >= 2) {
      this.__smartUserSize = [this.size[0], this.size[1]];
    }
    return result;
  };

  if (typeof V1State.originalConfigure === "function") {
    window.LGraphNode.prototype.configure = function (info) {
      const result = V1State.originalConfigure.apply(this, arguments);
      if (this.size && this.size.length >= 2) {
        this.__smartUserSize = [this.size[0], this.size[1]];
      }
      return result;
    };
  }

  if (V1State.originalGraphAdd && typeof V1State.originalGraphAdd === "function") {
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

  window.refreshSmartNodeSize = function (node) {
    if (!node || typeof node.computeSize !== "function" || typeof node.setSize !== "function") {
      return;
    }
    node.setSize(node.computeSize());
  };

  window.LGraphNode.prototype.__smartSizingPatched = true;
  window.LGraphNode.prototype.__smartSizingPatchVersion = PATCH_VERSION;
  window.LGraphNode.prototype.__smartSizingOriginalComputeSize = V1State.originalComputeSize;
  window.LGraphNode.prototype.__smartSizingOriginalSetSize = V1State.originalSetSize;
}


// ============================================================================
// Section 5: Node Arrangement Adapter
// ============================================================================

let arrangementPanel = null;
const ARRANGEMENT_STORAGE_KEY = "block-space-arrangement-panel-pos";

function arrangeSelection(canvas, mode) {
  const selected = canvas.selected_nodes;
  if (!selected) return;

  const nodes = [];
  for (const id in selected) {
    if (selected[id] && selected[id].pos) nodes.push(selected[id]);
  }
  if (nodes.length < 2) return;

  if (canvas.graph) canvas.graph.beforeChange();

  const hMargin = getHSnapMargin();
  const vMargin = getVSnapMargin();
  const titleH = Number(window.LiteGraph && window.LiteGraph.NODE_TITLE_HEIGHT) || 24;

  nodes.sort(function(a, b) {
    if (Math.abs(a.pos[1] - b.pos[1]) > 5) return a.pos[1] - b.pos[1];
    return a.pos[0] - b.pos[0];
  });
  const anchor = nodes[0];
  const startX = anchor.pos[0];
  const startY = anchor.pos[1];

  if (mode === "grid") {
    // Smart harmonized grid
    const columns = [];
    const sortedByX = nodes.slice().sort((a, b) => a.pos[0] - b.pos[0]);

    for (let i = 0; i < sortedByX.length; i++) {
      const node = sortedByX[i];
      let placed = false;
      for (let c = 0; c < columns.length; c++) {
        const avgX = columns[c].reduce((sum, n) => sum + n.pos[0], 0) / columns[c].length;
        if (Math.abs(node.pos[0] - avgX) < 150) {
          columns[c].push(node);
          placed = true;
          break;
        }
      }
      if (!placed) columns.push([node]);
    }

    columns.forEach(col => col.sort((a, b) => a.pos[1] - b.pos[1]));
    columns.sort((a, b) => (a[0].pos[0] - b[0].pos[0]));

    const colWidths = columns.map(col => Math.max(...col.map(n => {
      const b = getNodeBounds(n);
      return b ? b.right - b.left : 0;
    })));
    const colHeights = columns.map(col => {
      const sum = col.reduce((sum, n) => {
        const b = getNodeBounds(n);
        return sum + (b ? b.bottom - b.top : 0);
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

      for (let r = 0; r < col.length; r++) {
        const node = col[r];
        const bounds = getNodeBounds(node);
        node.pos[0] = currentX;
        node.pos[1] = currentY;
        const newContentHeight = Math.max(node.size[1], (bounds ? bounds.bottom - bounds.top : 0) + heightBonusPerNode - titleH);
        node.size[1] = newContentHeight;
        node.size[0] = colWidths[c];
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
        node.pos[0] = anchor.pos[0];
        node.pos[1] = prevBounds.bottom + vMargin;
      } else {
        node.pos[1] = anchor.pos[1];
        node.pos[0] = prevBounds.right + hMargin;
      }
    }
  }

  if (canvas.graph) canvas.graph.afterChange();
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
  arrangementPanel.style.position = "fixed";
  arrangementPanel.style.backgroundColor = "rgba(30, 30, 30, 0.95)";
  arrangementPanel.style.border = "1px solid #444";
  arrangementPanel.style.borderRadius = "8px";
  arrangementPanel.style.padding = "8px 12px";
  arrangementPanel.style.display = "none";
  arrangementPanel.style.flexDirection = "row";
  arrangementPanel.style.gap = "10px";
  arrangementPanel.style.alignItems = "center";
  arrangementPanel.style.boxShadow = "0 4px 15px rgba(0,0,0,0.5)";
  arrangementPanel.style.zIndex = "10000";
  arrangementPanel.style.transition = "opacity 0.2s ease, transform 0.2s ease";
  arrangementPanel.style.pointerEvents = "auto";

  const savedPos = localStorage.getItem(ARRANGEMENT_STORAGE_KEY);
  if (savedPos) {
    try {
      const pos = JSON.parse(savedPos);
      arrangementPanel.style.left = pos.x + "px";
      arrangementPanel.style.top = pos.y + "px";
      arrangementPanel.style.transform = "none";
    } catch(e) {
      arrangementPanel.style.top = "20px";
      arrangementPanel.style.left = "50%";
      arrangementPanel.style.transform = "translateX(-50%)";
    }
  } else {
    arrangementPanel.style.top = "20px";
    arrangementPanel.style.left = "50%";
    arrangementPanel.style.transform = "translateX(-50%)";
  }

  const handle = document.createElement("div");
  handle.style.display = "flex";
  handle.style.alignItems = "center";
  handle.style.cursor = "grab";
  handle.style.userSelect = "none";
  handle.style.marginRight = "8px";
  handle.style.paddingRight = "8px";
  handle.style.borderRight = "1px solid #444";

  const dragIcon = `<span style="color:#666; font-size:14px; margin-right:6px; font-family:monospace;">⠿</span>`;

  const svgIcon = `
    <svg class="block-space-nav-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:16px; height:16px; margin-right:8px; vertical-align:middle; pointer-events:none;">
      <path d="M4 4H10V10H4V4Z" fill="#57b1ff" rx="1"/>
      <path d="M14 14H20V20H14V14Z" fill="#8dff57" rx="1"/>
      <path d="M14 4H20V10H14V4Z" fill="transparent" rx="1" stroke="#57b1ff" stroke-width="2"/>
      <path d="M4 14H10V20H4V14Z" fill="transparent" rx="1" stroke="#8dff57" stroke-width="2"/>
      <line x1="10" y1="10" x2="14" y2="14" stroke="#b57cff" stroke-width="2" stroke-linecap="round" stroke-dasharray="2 3"/>
    </svg>
  `;

  handle.innerHTML = dragIcon + svgIcon + `<span style="color:#888; font-size:11px; font-weight:bold; white-space:nowrap;">Block Space</span>`;
  arrangementPanel.appendChild(handle);

  let isDragging = false;
  let offsetX, offsetY;

  handle.onmousedown = function(e) {
    isDragging = true;
    handle.style.cursor = "grabbing";
    const rect = arrangementPanel.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    arrangementPanel.style.transition = "none";
    e.preventDefault();
  };

  window.addEventListener("mousemove", function(e) {
    if (!isDragging) return;
    const nx = e.clientX - offsetX;
    const ny = e.clientY - offsetY;
    arrangementPanel.style.left = nx + "px";
    arrangementPanel.style.top = ny + "px";
    arrangementPanel.style.transform = "none";
  });

  window.addEventListener("mouseup", function() {
    if (!isDragging) return;
    isDragging = false;
    handle.style.cursor = "grab";
    arrangementPanel.style.transition = "opacity 0.2s ease, transform 0.2s ease";

    const rect = arrangementPanel.getBoundingClientRect();
    localStorage.setItem(ARRANGEMENT_STORAGE_KEY, JSON.stringify({ x: rect.left, y: rect.top }));
  });

  function createBtn(text, icon, callback) {
    const btn = document.createElement("button");
    btn.innerHTML = `<span style="margin-right:6px">${icon}</span>${text}`;
    btn.style.backgroundColor = "#333";
    btn.style.color = "#eee";
    btn.style.border = "1px solid #555";
    btn.style.borderRadius = "4px";
    btn.style.padding = "6px 12px";
    btn.style.cursor = "pointer";
    btn.style.fontSize = "12px";
    btn.style.display = "flex";
    btn.style.alignItems = "center";
    btn.style.transition = "background-color 0.1s, border-color 0.1s";

    btn.onmouseenter = function() {
      btn.style.backgroundColor = "#444";
      btn.style.borderColor = "#777";
    };
    btn.onmouseleave = function() {
      btn.style.backgroundColor = "#333";
      btn.style.borderColor = "#555";
    };
    btn.onclick = callback;

    return btn;
  }

  arrangementPanel.appendChild(createBtn("Stack", "↕️", function() {
    if (window.app && window.app.canvas) arrangeSelection(window.app.canvas, "y");
  }));

  arrangementPanel.appendChild(createBtn("Flow", "↔️", function() {
    if (window.app && window.app.canvas) arrangeSelection(window.app.canvas, "x");
  }));

  arrangementPanel.appendChild(createBtn("Harmonize", "💎", function() {
    if (window.app && window.app.canvas) arrangeSelection(window.app.canvas, "grid");
  }));

  document.body.appendChild(arrangementPanel);
  return arrangementPanel;
}

function updatePanelVisibility() {
  const canvas = window.app && window.app.canvas;
  if (!canvas) return;

  let selectedCount = 0;
  if (canvas.selected_nodes) {
    selectedCount = Object.keys(canvas.selected_nodes).length;
  }

  const p = createArrangementPanel();
  if (selectedCount > 1) {
    if (p.style.display === "none") {
      p.style.display = "flex";
      p.style.opacity = "0";
      if (!localStorage.getItem(ARRANGEMENT_STORAGE_KEY)) {
        p.style.transform = "translateX(-50%) translateY(-10px)";
        setTimeout(function() {
          p.style.opacity = "1";
          p.style.transform = "translateX(-50%) translateY(0)";
        }, 10);
      } else {
        setTimeout(function() { p.style.opacity = "1"; }, 10);
      }
    }
  } else {
    if (p.style.display === "flex") {
      p.style.opacity = "0";
      if (!localStorage.getItem(ARRANGEMENT_STORAGE_KEY)) {
        p.style.transform = "translateX(-50%) translateY(-10px)";
      }
      setTimeout(function() {
        p.style.display = "none";
      }, 200);
    }
  }
}

function initNodeArrangementAdapter() {
  // Ensure only one poller is active across script reloads
  if (window.__blockSpaceArrangementPoller) {
    clearInterval(window.__blockSpaceArrangementPoller);
  }
  window.__blockSpaceArrangementPoller = setInterval(updatePanelVisibility, 200);
  console.log("[BlockSpace] Arrangement Panel loaded.");
}

// ============================================================================
// Unified processMouseUp Handler
// ============================================================================

function initUnifiedMouseUpHandler() {
  // Store original once
  const originalProcessMouseUp = window.LGraphCanvas.prototype.processMouseUp;
  V1State.originalProcessMouseUp = originalProcessMouseUp;

  window.LGraphCanvas.prototype.processMouseUp = function(event) {
    // 1. Capture smart-drop state BEFORE original (needs connecting_node state)
    const smartDropState = captureOriginDragState(this);
    const hadSmartDropDrag = !!smartDropState;

    // 2. Call original LiteGraph handler
    const result = originalProcessMouseUp.apply(this, arguments);

    // 3. Node Snapping: Commit snap after original
    const nodeHint = this.resizing_node || this.node_dragged || this.current_node || null;
    maybeCommitSnapOnMouseUp(this, nodeHint);
    clearSnapVisual(this);
    clearSnapFeedbackState(this, true);
    this.__blockSpacePrevDragPoint = null;
    this.__blockSpaceMoveXPointMemory = null;
    this.__blockSpaceMoveYPointMemory = null;
    this.__blockSpacePrevResizeSize = null;
    this.__blockSpaceResizeDimensionMemory = null;
    this.__blockSpaceResizeDebugStatus = null;
    this.__blockSpaceRecentSnap = null;
    renderResizeDebugHud(this);

    // 4. Connection Focus: Clear focus
    clearFocusState();

    // 5. Smart Drop: Handle connection if needed
    if (hadSmartDropDrag && smartDropState && smartDropState.originOutput) {
      const currentLinkCount = Array.isArray(smartDropState.originOutput.links)
        ? smartDropState.originOutput.links.length
        : 0;

      if (currentLinkCount <= smartDropState.linkCountBefore) {
        const dropCanvasX = event && typeof event.canvasX === "number" ? event.canvasX : null;
        const dropCanvasY = event && typeof event.canvasY === "number" ? event.canvasY : null;
        const dropClientX = event && typeof event.clientX === "number" ? event.clientX : 0;
        const dropClientY = event && typeof event.clientY === "number" ? event.clientY : 0;

        if (this.graph && typeof this.graph.getNodeOnPos === "function" &&
            typeof dropCanvasX === "number" && typeof dropCanvasY === "number") {
          const targetNode = this.graph.getNodeOnPos(dropCanvasX, dropCanvasY);
          if (targetNode && Array.isArray(targetNode.inputs) && targetNode.inputs.length > 0) {
            const originType = smartDropState.originOutput.type;
            const validMatches = [];
            for (let i = 0; i < targetNode.inputs.length; i++) {
              const input = targetNode.inputs[i];
              if (!input) continue;
              if (areTypesCompatible(originType, input.type)) {
                validMatches.push({ inputIndex: i, inputName: input.name || "input_" + i });
              }
            }

            if (validMatches.length === 1) {
              smartDropState.originNode.connect(smartDropState.originSlotIndex, targetNode, validMatches[0].inputIndex);
            } else if (validMatches.length > 1) {
              createAmbiguityMenu({
                clientX: dropClientX,
                clientY: dropClientY,
                matches: validMatches,
                originNode: smartDropState.originNode,
                originSlotIndex: smartDropState.originSlotIndex,
                targetNode: targetNode,
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

export function initV1Adapter() {
  // Check prerequisites
  if (typeof window.LGraphCanvas === 'undefined' || !window.LGraphCanvas.prototype) {
    console.error('[BlockSpace V1 Adapter] LGraphCanvas not available');
    return false;
  }

  // Check if already initialized
  if (window.__blockSpaceV1AdapterInitialized) {
    return true;
  }

  // Initialize in order of dependencies
  // 1. Smart Sizing (independent)
  initSmartSizingPatches();

  // 2. Node Arrangement (independent)
  initNodeArrangementAdapter();

  // 3. Connection Focus (patches renderLink, drawNode)
  initConnectionFocusPatches();

  // 4. Node Snapping (patches processMouseMove)
  initNodeSnappingPatches();

  // 5. Smart Drop (flags as patched, actual logic in unified handler)
  initSmartDropPatches();

  // 6. Unified MouseUp Handler (coordinates snapping, focus, smart-drop)
  initUnifiedMouseUpHandler();

  // Mark as initialized
  window.__blockSpaceV1AdapterInitialized = true;
  console.log('[BlockSpace] V1 Adapter initialized');
  return true;
}

// Cleanup function for hot-reloading
export function cleanupV1Adapter() {
  // Restore all original methods
  if (V1State.originalProcessMouseMove) {
    window.LGraphCanvas.prototype.processMouseMove = V1State.originalProcessMouseMove;
  }
  if (V1State.originalProcessMouseUp) {
    window.LGraphCanvas.prototype.processMouseUp = V1State.originalProcessMouseUp;
  }
  if (V1State.originalProcessMouseDown) {
    window.LGraphCanvas.prototype.processMouseDown = V1State.originalProcessMouseDown;
  }
  if (V1State.originalRenderLink) {
    window.LGraphCanvas.prototype.renderLink = V1State.originalRenderLink;
  }
  if (V1State.originalDrawNodeCF) {
    window.LGraphCanvas.prototype.drawNode = V1State.originalDrawNodeCF;
  }
  if (V1State.originalComputeSize) {
    window.LGraphNode.prototype.computeSize = V1State.originalComputeSize;
  }
  if (V1State.originalSetSize) {
    window.LGraphNode.prototype.setSize = V1State.originalSetSize;
  }
  if (V1State.originalConfigure) {
    window.LGraphNode.prototype.configure = V1State.originalConfigure;
  }

  // Clear intervals
  if (window.__blockSpaceArrangementPoller) {
    clearInterval(window.__blockSpaceArrangementPoller);
    window.__blockSpaceArrangementPoller = null;
  }

  // Stop animation loop
  stopAnimationLoop();

  // Remove DOM elements
  const panel = document.getElementById("block-space-arrangement-panel");
  if (panel && panel.parentNode) {
    panel.parentNode.removeChild(panel);
  }
  clearDimensionAssociationLayer();
  destroyActiveMenu();

  // Clear flags
  window.__blockSpaceV1AdapterInitialized = false;
  if (window.LGraphCanvas.prototype) {
    window.LGraphCanvas.prototype.__blockSpaceNodeSnapPatched = false;
    window.LGraphCanvas.prototype.__connectionFocusPatched = false;
    window.LGraphCanvas.prototype.__smartDropPatched = false;
  }
  if (window.LGraphNode.prototype) {
    window.LGraphNode.prototype.__smartSizingPatched = false;
  }

  console.log('[BlockSpace] V1 Adapter cleaned up');
}

// Default export
export default { initV1Adapter, cleanupV1Adapter };

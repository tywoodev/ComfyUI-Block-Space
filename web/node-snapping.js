(function () {
  "use strict";

  if (typeof window.LGraphCanvas === "undefined" || !window.LGraphCanvas.prototype) {
    return;
  }
  if (window.LGraphCanvas.prototype.__blockSpaceNodeSnapPatched) {
    return;
  }

  var SNAP_THRESHOLD = 10;
  var EXIT_THRESHOLD_MULTIPLIER = 1.5; // 10px to enter, 15px to exit
  var DEFAULT_H_SNAP_MARGIN = 60;
  var DEFAULT_V_SNAP_MARGIN = 40;
  var DEFAULT_MOVE_SNAP_STRENGTH = 1.0;
  var DEFAULT_MOVE_Y_SNAP_STRENGTH = 2.4;
  var DEFAULT_RESIZE_SNAP_STRENGTH = 2.4; // Increased from 1.8 for better catch
  var DEFAULT_DIMENSION_TOLERANCE_PX = 12;
  var DEFAULT_HIGHLIGHT_ENABLED = true;
  var DEFAULT_HIGHLIGHT_COLOR = "#1a3a6b";
  var DEFAULT_FEEDBACK_ENABLED = true;
  var DEFAULT_FEEDBACK_PULSE_MS = 160;
  var DEFAULT_FEEDBACK_COLOR_X = "#1a3a6b";
  var DEFAULT_FEEDBACK_COLOR_Y = "#b57cff";
  var DEFAULT_FEEDBACK_COLOR_XY = "#1a6b35";
  var WINNER_HIGHLIGHT_BG_FALLBACK = "#3a3f47";
  var DEBUG_RESIZE_SNAPPING = false;
  var RESIZE_SEARCH_DISTANCE_MULTIPLIER = 4;
  var SNAP_MOUSEUP_GRACE_MS = 220;
  var SNAP_MOUSEUP_TOLERANCE_MULTIPLIER = 1.8;
  var MOVE_Y_STICKY_MULTIPLIER = 3.2;
  var MOVE_Y_STICKY_MIN_PX = 24;
  var DIMENSION_ASSOC_LAYER_ID = "block-space-dimension-association-layer";

  var HIGHLIGHT_COLOR_MAP = {
    "Comfy Blue": "#1a3a6b",
    "Cyber Purple": "#b57cff",
    "Neon Green": "#39ff14",
    "Hot Pink": "#ff00ae",
    "Ghost White": "#ffffff",
    "Amber Gold": "#ffd700",
    "Signal Orange": "#ff4500",
  };

  var originalProcessMouseMove = window.LGraphCanvas.prototype.processMouseMove;
  var originalProcessMouseUp = window.LGraphCanvas.prototype.processMouseUp;

  function getCanvasScale(canvas) {
    var scale = canvas && canvas.ds ? Number(canvas.ds.scale) : 1;
    return isFinite(scale) && scale > 0 ? scale : 1;
  }

  function clampNumber(value, min, max, fallback) {
    var n = Number(value);
    if (!isFinite(n)) {
      n = fallback;
    }
    if (min != null && n < min) {
      n = min;
    }
    if (max != null && n > max) {
      n = max;
    }
    return n;
  }

  function getSettingValue(settingId, fallback) {
    try {
      if (
        window.app &&
        window.app.ui &&
        window.app.ui.settings &&
        typeof window.app.ui.settings.getSettingValue === "function"
      ) {
        var value = window.app.ui.settings.getSettingValue(settingId);
        return value == null ? fallback : value;
      }
    } catch (error) {
      // Ignore setting read failures.
    }
    return fallback;
  }

  function getHSnapMargin() {
    return clampNumber(
      getSettingValue("BlockSpace.Snap.HMarginPx", DEFAULT_H_SNAP_MARGIN),
      0,
      500,
      DEFAULT_H_SNAP_MARGIN
    );
  }

  function getVSnapMargin() {
    return clampNumber(
      getSettingValue("BlockSpace.Snap.VMarginPx", DEFAULT_V_SNAP_MARGIN),
      0,
      500,
      DEFAULT_V_SNAP_MARGIN
    );
  }

  function getSnapThreshold() {
    return clampNumber(
      getSettingValue("BlockSpace.Snap.Sensitivity", SNAP_THRESHOLD),
      2,
      50,
      SNAP_THRESHOLD
    );
  }

  function isSnappingEnabled() {
    return !!getSettingValue("BlockSpace.Snap.Enabled", true);
  }

  function getMoveSnapStrength() {
    return clampNumber(
      getSettingValue("BlockSpace.Snap.MoveStrength", DEFAULT_MOVE_SNAP_STRENGTH),
      0.1,
      5,
      DEFAULT_MOVE_SNAP_STRENGTH
    );
  }

  function getResizeSnapStrength() {
    return clampNumber(
      getSettingValue("BlockSpace.Snap.ResizeStrength", DEFAULT_RESIZE_SNAP_STRENGTH),
      0.1,
      5,
      DEFAULT_RESIZE_SNAP_STRENGTH
    );
  }

  function getMoveYSnapStrength() {
    return clampNumber(
      getSettingValue(
        "BlockSpace.Snap.MoveYSnapStrength",
        getSettingValue("BlockSpace.Snap.MoveStrength", DEFAULT_MOVE_Y_SNAP_STRENGTH)
      ),
      0.1,
      8,
      DEFAULT_MOVE_Y_SNAP_STRENGTH
    );
  }

  function getDimensionTolerancePx() {
    return clampNumber(
      getSettingValue("BlockSpace.Snap.DimensionTolerancePx", DEFAULT_DIMENSION_TOLERANCE_PX),
      1,
      64,
      DEFAULT_DIMENSION_TOLERANCE_PX
    );
  }

  function getHighlightEnabled() {
    return !!getSettingValue("BlockSpace.Snap.HighlightEnabled", DEFAULT_HIGHLIGHT_ENABLED);
  }

  function getHighlightColor() {
    var value = getSettingValue("BlockSpace.Snap.HighlightColor", "Comfy Blue");
    if (HIGHLIGHT_COLOR_MAP[value]) {
      return HIGHLIGHT_COLOR_MAP[value];
    }
    return typeof value === "string" && value.trim() ? value.trim() : DEFAULT_HIGHLIGHT_COLOR;
  }

  function getFeedbackEnabled() {
    return isSnappingEnabled();
  }

  function getFeedbackPulseMs() {
    return clampNumber(
      getSettingValue("BlockSpace.Snap.FeedbackPulseMs", DEFAULT_FEEDBACK_PULSE_MS),
      60,
      3000,
      DEFAULT_FEEDBACK_PULSE_MS
    );
  }

  function getFeedbackColorX() {
    var value = getSettingValue("BlockSpace.Snap.FeedbackColorX", DEFAULT_FEEDBACK_COLOR_X);
    return typeof value === "string" && value.trim() ? value.trim() : DEFAULT_FEEDBACK_COLOR_X;
  }

  function getFeedbackColorY() {
    var value = getSettingValue("BlockSpace.Snap.FeedbackColorY", DEFAULT_FEEDBACK_COLOR_Y);
    return typeof value === "string" && value.trim() ? value.trim() : DEFAULT_FEEDBACK_COLOR_Y;
  }

  function getFeedbackColorXY() {
    var value = getSettingValue("BlockSpace.Snap.FeedbackColorXY", DEFAULT_FEEDBACK_COLOR_XY);
    return typeof value === "string" && value.trim() ? value.trim() : DEFAULT_FEEDBACK_COLOR_XY;
  }

  function getNodeBounds(node) {
    if (!node || !node.pos || !node.size) {
      return null;
    }
    var left = Number(node.pos[0]) || 0;
    var top = Number(node.pos[1]) || 0;
    var width = Math.max(0, Number(node.size[0]) || 0);
    var contentHeight = Math.max(0, Number(node.size[1]) || 0);
    
    // LiteGraph.NODE_TITLE_HEIGHT is usually 24px. 
    // node.pos[1] is the top of the title bar. 
    // node.size[1] is the height of the content area only.
    var titleH = Number(window.LiteGraph && window.LiteGraph.NODE_TITLE_HEIGHT) || 24;
    var totalHeight = contentHeight + titleH;

    return {
      left: left,
      right: left + width,
      top: top,
      bottom: top + totalHeight,
      centerX: left + width * 0.5,
      centerY: top + (totalHeight * 0.5),
    };
  }

  function isLeftMouseDown(event) {
    if (!event) {
      return false;
    }
    var buttons = Number(event.buttons);
    if (isFinite(buttons) && buttons >= 0) {
      return (buttons & 1) === 1;
    }
    var which = Number(event.which);
    return which === 1;
  }

  function getActiveDraggedNode(canvas, event) {
    if (!canvas) {
      return null;
    }
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

  function buildDimensionClusters(samples, tolerancePx) {
    if (!Array.isArray(samples) || !samples.length) {
      return [];
    }
    var sorted = samples
      .map(function (entry) {
        if (entry && typeof entry === "object") {
          var n = Number(entry.value);
          if (isFinite(n)) { // REMOVED the n > 0 restriction
            return { value: n, node: entry.node || null };
          }
          return null;
        }
        var numeric = Number(entry);
        if (isFinite(numeric)) { // REMOVED the numeric > 0 restriction
          return { value: numeric, node: null };
        }
        return null;
      })
      .filter(function (entry) { return !!entry; })
      .sort(function (a, b) { return a.value - b.value; });
      
    if (!sorted.length) {
      return [];
    }

    var clusters = [];
    for (var i = 0; i < sorted.length; i += 1) {
      var sample = sorted[i];
      var value = sample.value;
      var cluster = clusters.length ? clusters[clusters.length - 1] : null;
      if (!cluster || Math.abs(value - cluster.center) > tolerancePx) {
        clusters.push({
          center: value,
          count: 1,
          min: value,
          max: value,
          sum: value,
          members: [sample],
        });
        continue;
      }
      cluster.count += 1;
      cluster.sum += value;
      cluster.center = cluster.sum / cluster.count;
      cluster.min = Math.min(cluster.min, value);
      cluster.max = Math.max(cluster.max, value);
      cluster.members.push(sample);
    }
    return clusters;
  }

  function pickDominantCluster(clusters) {
    if (!Array.isArray(clusters) || !clusters.length) {
      return null;
    }
    var winner = clusters[0];
    for (var i = 1; i < clusters.length; i += 1) {
      var cluster = clusters[i];
      if (cluster.count > winner.count) {
        winner = cluster;
        continue;
      }
      if (cluster.count === winner.count && cluster.center > winner.center) {
        winner = cluster;
      }
    }
    return winner;
  }

  function pickDirectionalCluster(clusters, currentDim, intent) {
    if (!Array.isArray(clusters) || !clusters.length || !isFinite(currentDim)) {
      return null;
    }
    var filtered = [];
    for (var i = 0; i < clusters.length; i += 1) {
      var c = clusters[i];
      if (!c || !isFinite(c.center)) {
        continue;
      }
      if (intent === "expand") {
        if (c.center > currentDim) filtered.push(c);
      } else if (intent === "shrink") {
        if (c.center < currentDim) filtered.push(c);
      } else {
        // "steady" or "neutral" - include everything to find closest
        filtered.push(c);
      }
    }
    if (!filtered.length) {
      return null;
    }
    filtered.sort(function (a, b) {
      var da = Math.abs(a.center - currentDim);
      var db = Math.abs(b.center - currentDim);
      if (da !== db) return da - db;
      if (a.count !== b.count) return b.count - a.count;
      return b.center - a.center;
    });
    return filtered[0];
  }

  function pickNearestMoveCluster(clusters, currentValue) {
    if (!Array.isArray(clusters) || !clusters.length || !isFinite(currentValue)) {
      return null;
    }
    var sorted = clusters.slice().sort(function (a, b) {
      var da = Math.abs(Number(a.center) - currentValue);
      var db = Math.abs(Number(b.center) - currentValue);
      if (da !== db) return da - db;
      if ((a.count || 0) !== (b.count || 0)) return (b.count || 0) - (a.count || 0);
      return (b.center || 0) - (a.center || 0);
    });
    return sorted[0];
  }

  function ensureResizeDimensionMemory(canvas, resizingNode) {
    if (!canvas || !resizingNode) {
      return null;
    }
    var memory = canvas.__blockSpaceResizeDimensionMemory;
    if (memory && memory.nodeId === resizingNode.id) {
      return memory;
    }

    var allNodes = getGraphNodes(canvas);
    var activeBounds = getNodeBounds(resizingNode);
    if (!activeBounds) return null;

    // --- ENVELOPE NEIGHBOR SEARCH ---
    var padding = 1500;
    var targetNodes = [];
    for (var nIdx = 0; nIdx < allNodes.length; nIdx++) {
      var n = allNodes[nIdx];
      if (!n || n === resizingNode || n.constructor === window.LGraphGroup) continue;
      var b = getNodeBounds(n);
      if (!b) continue;
      
      var isNearX = b.right >= (activeBounds.left - padding) && b.left <= (activeBounds.right + padding);
      var isNearY = b.bottom >= (activeBounds.top - padding) && b.top <= (activeBounds.bottom + padding);
      
      if (isNearX && isNearY) {
        targetNodes.push(n);
      }
    }

    var widthSamples = [];
    var heightSamples = [];
    var rightEdgeSamples = [];
    var bottomEdgeSamples = [];

    var hSnapMargin = getHSnapMargin();
    var vSnapMargin = getVSnapMargin();

    for (var i = 0; i < targetNodes.length; i += 1) {
      var node = targetNodes[i];
      var bounds = getNodeBounds(node);
      if (!bounds) continue;

      // 1. Dimension Match Targets
      var targetWidth = bounds.right - bounds.left;
      var targetHeight = bounds.bottom - bounds.top;
      if (isFinite(targetWidth) && targetWidth > 0) widthSamples.push({ value: targetWidth, node: node });
      if (isFinite(targetHeight) && targetHeight > 0) heightSamples.push({ value: targetHeight, node: node });

      // 2. Right-Edge Alignment Targets
      rightEdgeSamples.push({ value: bounds.right, node: node });
      rightEdgeSamples.push({ value: bounds.left, node: node });
      rightEdgeSamples.push({ value: bounds.left - hSnapMargin, node: node });

      // 3. Bottom-Edge Alignment Targets
      bottomEdgeSamples.push({ value: bounds.bottom, node: node });
      bottomEdgeSamples.push({ value: bounds.top, node: node });
      bottomEdgeSamples.push({ value: bounds.top - vSnapMargin, node: node });
    }
    var tolerancePx = getDimensionTolerancePx();
    memory = {
      nodeId: resizingNode.id,
      tolerancePx: tolerancePx,
      widthClusters: buildDimensionClusters(widthSamples, tolerancePx),
      heightClusters: buildDimensionClusters(heightSamples, tolerancePx),
      rightEdgeClusters: buildDimensionClusters(rightEdgeSamples, tolerancePx),
      bottomEdgeClusters: buildDimensionClusters(bottomEdgeSamples, tolerancePx),
      sampleNodeCount: Math.max(widthSamples.length, heightSamples.length),
      createdAt: Date.now(),
    };
    canvas.__blockSpaceResizeDimensionMemory = memory;
    return memory;
  }

  function ensureMoveYPointMemory(canvas, activeNode, vSnapMargin) {
    if (!canvas || !activeNode) {
      return null;
    }
    var memory = canvas.__blockSpaceMoveYPointMemory;
    if (memory && memory.nodeId === activeNode.id) {
      return memory;
    }
    
    var allNodes = getGraphNodes(canvas);
    var activeBounds = getNodeBounds(activeNode);
    if (!activeBounds) return null;

    var selectedNodesMap = canvas.selected_nodes || null;
    
    // --- ENVELOPE NEIGHBOR SEARCH ---
    var padding = 1500;
    var points = [];
    var activeHeight = activeBounds.bottom - activeBounds.top;

    for (var nIdx = 0; nIdx < allNodes.length; nIdx++) {
      var node = allNodes[nIdx];
      if (!node || node === activeNode || node.constructor === window.LGraphGroup) continue;
      if (selectedNodesMap && node.id != null && selectedNodesMap[node.id]) continue;
      
      var bounds = getNodeBounds(node);
      if (!bounds) continue;

      var isNearX = bounds.right >= (activeBounds.left - padding) && bounds.left <= (activeBounds.right + padding);
      var isNearY = bounds.bottom >= (activeBounds.top - padding) && bounds.top <= (activeBounds.bottom + padding);

      if (isNearX && isNearY) {
        // Flush Aligns
        points.push({ value: bounds.top, node: node, type: "top_flush" });
        points.push({ value: bounds.bottom - activeHeight, node: node, type: "bottom_flush" });
        
        // Stacking Margins
        points.push({ value: bounds.bottom + vSnapMargin, node: node, type: "stack_below" });
        points.push({ value: bounds.top - vSnapMargin - activeHeight, node: node, type: "stack_above" });
      }
    }
    
    memory = {
      nodeId: activeNode.id,
      tolerancePx: getDimensionTolerancePx(),
      points: points,
      createdAt: Date.now(),
    };
    canvas.__blockSpaceMoveYPointMemory = memory;
    return memory;
  }

  function ensureMoveXPointMemory(canvas, activeNode, hSnapMargin) {
    if (!canvas || !activeNode) return null;
    var memory = canvas.__blockSpaceMoveXPointMemory;
    if (memory && memory.nodeId === activeNode.id) return memory;
    
    var allNodes = getGraphNodes(canvas);
    var activeBounds = getNodeBounds(activeNode);
    if (!activeBounds) return null;

    var selectedNodesMap = canvas.selected_nodes || null;
    var padding = 1500;
    var points = [];
    var activeWidth = activeBounds.right - activeBounds.left;

    for (var nIdx = 0; nIdx < allNodes.length; nIdx++) {
      var node = allNodes[nIdx];
      if (!node || node === activeNode || node.constructor === window.LGraphGroup) continue;
      if (selectedNodesMap && node.id != null && selectedNodesMap[node.id]) continue;
      
      var bounds = getNodeBounds(node);
      if (!bounds) continue;

      var isNearX = bounds.right >= (activeBounds.left - padding) && bounds.left <= (activeBounds.right + padding);
      var isNearY = bounds.bottom >= (activeBounds.top - padding) && bounds.top <= (activeBounds.bottom + padding);

      if (isNearX && isNearY) {
        // Flush Aligns
        points.push({ value: bounds.left, node: node, type: "left_flush" });
        points.push({ value: bounds.right - activeWidth, node: node, type: "right_flush" });
        points.push({ value: bounds.left + (bounds.right - bounds.left)*0.5 - activeWidth*0.5, node: node, type: "center_flush" });

        // Stacking Margins
        points.push({ value: bounds.right + hSnapMargin, node: node, type: "stack_right" });
        points.push({ value: bounds.left - hSnapMargin - activeWidth, node: node, type: "stack_left" });
      }
    }
    
    memory = {
      nodeId: activeNode.id,
      tolerancePx: getDimensionTolerancePx(),
      points: points,
      createdAt: Date.now(),
    };
    canvas.__blockSpaceMoveXPointMemory = memory;
    return memory;
  }

  function getDragDelta(canvas, event) {
    if (!canvas || !event || typeof event.canvasX !== "number" || typeof event.canvasY !== "number") {
      return { dx: 0, dy: 0 };
    }
    var prev = canvas.__blockSpacePrevDragPoint;
    var current = { x: event.canvasX, y: event.canvasY };
    canvas.__blockSpacePrevDragPoint = current;
    if (!prev) {
      return { dx: 0, dy: 0 };
    }
    return {
      dx: current.x - prev.x,
      dy: current.y - prev.y,
    };
  }

  function rangesOverlap(aMin, aMax, bMin, bMax, tolerance) {
    var tol = Number(tolerance) || 0;
    return Math.min(aMax, bMax) - Math.max(aMin, bMin) >= -tol;
  }

  function collectValidTargetsForAxis(
    activeNode,
    activeBounds,
    allNodes,
    maxSearchDistance,
    axis,
    direction,
    ignoreMaxSearchDistance,
    selectedNodesMap
  ) {
    var valid = [];
    for (var i = 0; i < allNodes.length; i += 1) {
      var target = allNodes[i];
      if (!target || target === activeNode || target.constructor === window.LGraphGroup) {
        continue;
      }
      // Exclude other selected nodes from being snap targets
      if (selectedNodesMap && target.id != null && selectedNodesMap[target.id]) {
        continue;
      }
      var targetBounds = getNodeBounds(target);
      if (!targetBounds) {
        continue;
      }
      var emptySpace = 0;
      if (axis === "x") {
        if (direction === "left") {
          if (!(targetBounds.centerX < activeBounds.centerX)) continue;
          emptySpace = activeBounds.left - targetBounds.right;
        } else {
          // RIGHT DIRECTION logic added below
          if (!(targetBounds.centerX > activeBounds.centerX)) continue;
          emptySpace = targetBounds.left - activeBounds.right;
        }
        if (!rangesOverlap(activeBounds.top, activeBounds.bottom, targetBounds.top, targetBounds.bottom, 0)) {
          continue;
        }
      } else {
        if (direction === "above") {
          if (!(targetBounds.centerY < activeBounds.centerY)) {
            continue;
          }
          emptySpace = activeBounds.top - targetBounds.bottom;
        } else {
          if (!(targetBounds.centerY > activeBounds.centerY)) {
            continue;
          }
          emptySpace = targetBounds.top - activeBounds.bottom;
        }
        if (!rangesOverlap(activeBounds.left, activeBounds.right, targetBounds.left, targetBounds.right, 0)) {
          continue;
        }
      }
      if (!(emptySpace >= 0 && (ignoreMaxSearchDistance || emptySpace <= maxSearchDistance))) {
        continue;
      }
      valid.push({
        node: target,
        bounds: targetBounds,
        axis: axis,
        direction: direction,
        distance: Math.abs(activeBounds.top - targetBounds.top),
      });
    }
    return valid;
  }

  function chooseWinningTargetForAxis(
    activeNode,
    activeBounds,
    allNodes,
    maxSearchDistance,
    axis,
    primary,
    fallback,
    ignoreMaxSearchDistance,
    xSortByGap,
    selectedNodesMap
  ) {
    if (primary == null) {
      primary = axis === "y" ? "above" : "left";
    }
    if (typeof fallback === "undefined") {
      fallback = axis === "y" ? "below" : "right";
    }
    var valid = collectValidTargetsForAxis(
      activeNode,
      activeBounds,
      allNodes,
      maxSearchDistance,
      axis,
      primary,
      ignoreMaxSearchDistance,
      selectedNodesMap
    );
    if (!valid.length) {
      if (fallback) {
        valid = collectValidTargetsForAxis(
          activeNode,
          activeBounds,
          allNodes,
          maxSearchDistance,
          axis,
          fallback,
          ignoreMaxSearchDistance,
          selectedNodesMap
        );
      }
    }

    if (!valid.length) {
      return null;
    }

    valid.sort(function (a, b) {
      return a.distance - b.distance;
    });

    return valid[0];
  }

  function getNodeById(nodes, id) {
    if (!nodes || id == null) {
      return null;
    }
    for (var i = 0; i < nodes.length; i += 1) {
      if (nodes[i] && nodes[i].id === id) {
        return nodes[i];
      }
    }
    return null;
  }

  function computeWinningXCandidate(activeBounds, winner, snapMargin, useTopBottomFallback) {
    var winnerBounds = winner.bounds;
    var activeWidth = activeBounds.right - activeBounds.left;
    var candidates = [];

    if (useTopBottomFallback) {
      candidates.push({
        targetX: winnerBounds.left,
        delta: Math.abs(activeBounds.left - winnerBounds.left),
        mode: "align_left"
      });
      candidates.push({
        targetX: winnerBounds.right - activeWidth,
        delta: Math.abs(activeBounds.left - (winnerBounds.right - activeWidth)),
        mode: "align_right"
      });
      candidates.push({
        targetX: winnerBounds.centerX - (activeWidth * 0.5),
        delta: Math.abs(activeBounds.left - (winnerBounds.centerX - (activeWidth * 0.5))),
        mode: "align_center"
      });
    } else {
      var side = winner.direction || "left";
      if (side === "left") {
        candidates.push({
          targetX: winnerBounds.right + snapMargin,
          delta: Math.abs(activeBounds.left - (winnerBounds.right + snapMargin)),
          mode: "margin_right"
        });
        candidates.push({
          targetX: winnerBounds.right,
          delta: Math.abs(activeBounds.left - winnerBounds.right),
          mode: "flush_right"
        });
      } else {
        var marginX = winnerBounds.left - snapMargin - activeWidth;
        candidates.push({
          targetX: marginX,
          delta: Math.abs(activeBounds.left - marginX),
          mode: "margin_left"
        });
        var flushX = winnerBounds.left - activeWidth;
        candidates.push({
          targetX: flushX,
          delta: Math.abs(activeBounds.left - flushX),
          mode: "flush_left"
        });
      }
    }

    candidates.sort(function (a, b) {
      return a.delta - b.delta;
    });

    return candidates[0];
  }

  function getResizeDelta(canvas, node) {
    if (!canvas || !node || !node.size || node.size.length < 2) {
      return { dw: 0, dh: 0 };
    }
    var current = {
      id: node.id != null ? node.id : null,
      w: Number(node.size[0]) || 0,
      h: Number(node.size[1]) || 0,
    };
    var prev = canvas.__blockSpacePrevResizeSize;
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
    var minWidth = 10;
    var minHeight = 10;
    if (!node) {
      return [minWidth, minHeight];
    }

    if (node.min_size && node.min_size.length >= 2) {
      minWidth = Math.max(minWidth, Number(node.min_size[0]) || minWidth);
      minHeight = Math.max(minHeight, Number(node.min_size[1]) || minHeight);
    }

    var hasSmartMin = false;
    if (node.__smartMinSize && node.__smartMinSize.length >= 2) {
      minWidth = Math.max(minWidth, Number(node.__smartMinSize[0]) || minWidth);
      minHeight = Math.max(minHeight, Number(node.__smartMinSize[1]) || minHeight);
      hasSmartMin = true;
    }

    if (!hasSmartMin && typeof node.computeSize === "function") {
      try {
        var computed = node.computeSize(node.size && node.size.length >= 1 ? node.size[0] : undefined);
        if (computed && computed.length >= 2) {
          minWidth = Math.max(minWidth, Number(computed[0]) || minWidth);
          minHeight = Math.max(minHeight, Number(computed[1]) || minHeight);
        }
      } catch (error) {
      }
    }

    return [minWidth, minHeight];
  }

  function applyResizeSnapping(canvas, resizingNode, resizeAxisLock, resizeDelta) {
    if (!canvas || !resizingNode || resizingNode.constructor === window.LGraphGroup) {
      return false;
    }

    var bounds = getNodeBounds(resizingNode);
    if (!bounds) return false;

    var thresholdCanvas = (SNAP_THRESHOLD / Math.max(0.0001, getCanvasScale(canvas))) * getResizeSnapStrength();
    var exitThresholdCanvas = thresholdCanvas * EXIT_THRESHOLD_MULTIPLIER;
    var currentWidth = bounds.right - bounds.left;
    var currentHeight = bounds.bottom - bounds.top;
    var currentRight = bounds.right;
    var currentBottom = bounds.bottom;
    
    var minSize = getNodeMinSize(resizingNode);
    var memory = ensureResizeDimensionMemory(canvas, resizingNode);
    
    var widthWinner = memory ? pickDirectionalCluster(memory.widthClusters, currentWidth, "steady") : null;
    var heightWinner = memory ? pickDirectionalCluster(memory.heightClusters, currentHeight, "steady") : null;
    var rightEdgeWinner = memory ? pickNearestMoveCluster(memory.rightEdgeClusters, currentRight) : null;
    var bottomEdgeWinner = memory ? pickNearestMoveCluster(memory.bottomEdgeClusters, currentBottom) : null;

    var didSnap = false;
    var status = {
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

    var bestXWidth = null;
    var bestXDelta = Infinity;
    var bestXMode = null;
    var bestXNodes = [];

    if (widthWinner) {
      bestXDelta = Math.abs(currentWidth - widthWinner.center);
      bestXWidth = widthWinner.center;
      bestXMode = "dimension_match";
      bestXNodes = widthWinner.members.map(function(m){ return m.node; }).filter(n => !!n);
    }
    
    if (rightEdgeWinner) {
      var edgeDelta = Math.abs(currentRight - rightEdgeWinner.center);
      if (edgeDelta < (bestXDelta - 2)) {
        bestXDelta = edgeDelta;
        bestXWidth = rightEdgeWinner.center - bounds.left;
        bestXMode = "edge_align_right";
        bestXNodes = rightEdgeWinner.members.map(function(m){ return m.node; }).filter(n => !!n);
      }
    }
    
    status.xMode = bestXMode;
    status.xWinnerNodes = bestXNodes;

    var recentSnap = canvas.__blockSpaceRecentSnap;
    var wasSnappedX = recentSnap && recentSnap.kind === "resize" && recentSnap.nodeId === resizingNode.id && recentSnap.xDidSnap;
    var currentThresholdX = wasSnappedX ? exitThresholdCanvas : thresholdCanvas;

    if (bestXWidth !== null && bestXDelta <= currentThresholdX) {
      var nextWidth = Math.max(minSize[0], bestXWidth);
      if (isFinite(nextWidth) && Math.abs(nextWidth - currentWidth) > 0.01) {
        resizingNode.size[0] = nextWidth;
        didSnap = true;
        status.xDidSnap = true;
        status.xTarget = bestXWidth;
        status.xDelta = bestXDelta;
      }
    }

    var bestYHeight = null;
    var bestYDelta = Infinity;
    var bestYMode = null;
    var bestYNodes = [];
    var titleH = Number(window.LiteGraph && window.LiteGraph.NODE_TITLE_HEIGHT) || 24;

    if (heightWinner) {
      bestYDelta = Math.abs(currentHeight - heightWinner.center);
      bestYHeight = heightWinner.center;
      bestYMode = "dimension_match";
      bestYNodes = heightWinner.members.map(function(m){ return m.node; }).filter(n => !!n);
    }
    
    if (bottomEdgeWinner) {
      var edgeDeltaY = Math.abs(currentBottom - bottomEdgeWinner.center);
      if (edgeDeltaY < (bestYDelta - 2)) {
        bestYDelta = edgeDeltaY;
        bestYHeight = bottomEdgeWinner.center - bounds.top;
        bestYMode = "edge_align_bottom";
        bestYNodes = bottomEdgeWinner.members.map(function(m){ return m.node; }).filter(n => !!n);
      }
    }
    
    status.yMode = bestYMode;
    status.yWinnerNodes = bestYNodes;

    var wasSnappedY = recentSnap && recentSnap.kind === "resize" && recentSnap.nodeId === resizingNode.id && recentSnap.yDidSnap;
    var currentThresholdY = wasSnappedY ? exitThresholdCanvas : thresholdCanvas;

    if (bestYHeight !== null && bestYDelta <= currentThresholdY) {
      var nextContentHeight = Math.max(minSize[1], bestYHeight - titleH);
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
    var nodes = getGraphNodes(canvas);
    var changed = false;
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      if (!node || node.constructor === window.LGraphGroup) continue;
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

  function setWinnerHighlight(canvas, winnerNode) {
    clearSnapVisual(canvas);
  }

  function rememberRecentSnap(canvas, snap) {
    if (!canvas || !snap) return;
    snap.at = Date.now();
    canvas.__blockSpaceRecentSnap = snap;
  }

  function maybeCommitSnapOnMouseUp(canvas, nodeHint) {
    if (!canvas) return false;
    var snap = canvas.__blockSpaceRecentSnap;
    if (!snap || !snap.at || Date.now() - snap.at > SNAP_MOUSEUP_GRACE_MS) return false;

    var node = nodeHint;
    if (!node || (snap.nodeId != null && node.id !== snap.nodeId)) {
      node = getNodeById(getGraphNodes(canvas), snap.nodeId);
    }
    if (!node || node.constructor === window.LGraphGroup || !node.pos || !node.size) return false;

    var bounds = getNodeBounds(node);
    if (!bounds) return false;
    var tolerance = Math.max(2, (Number(snap.threshold) || 0) * SNAP_MOUSEUP_TOLERANCE_MULTIPLIER);
    var appliedX = false;
    var appliedY = false;

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
      var minSize = getNodeMinSize(node);
      if (snap.xDidSnap && typeof snap.xTargetRight === "number" && Math.abs(bounds.right - snap.xTargetRight) <= tolerance) {
        node.size[0] = Math.max(minSize[0], snap.xTargetRight - bounds.left);
        appliedX = true;
      }
      if (snap.yDidSnap && typeof snap.yTargetBottom === "number" && Math.abs(bounds.bottom - snap.yTargetBottom) <= tolerance) {
        node.size[1] = Math.max(minSize[1], snap.yTargetBottom - bounds.top);
        appliedY = true;
      }
    }

    if (appliedX || appliedY) {
      triggerSnapFeedback(canvas, node, appliedX, appliedY, snap.kind === "move");
      return true;
    }
    return false;
  }

  function normalizeColor(value) {
    return String(value || "").trim().toLowerCase();
  }

  function ensureDimensionAssociationLayer() {
    var layer = document.getElementById(DIMENSION_ASSOC_LAYER_ID);
    if (layer) return layer;
    layer = document.createElement("div");
    layer.id = DIMENSION_ASSOC_LAYER_ID;
    layer.style.position = "fixed";
    layer.style.left = "0"; layer.style.top = "0";
    layer.style.width = "100vw"; layer.style.height = "100vh";
    layer.style.pointerEvents = "none"; layer.style.zIndex = "9999";
    document.body.appendChild(layer);
    return layer;
  }

  function clearDimensionAssociationLayer() {
    var layer = document.getElementById(DIMENSION_ASSOC_LAYER_ID);
    if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
  }

  function renderDimensionAssociationHighlights(canvas, status) {
    var layer = ensureDimensionAssociationLayer();
    if (!layer) return;
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    if (!canvas || !status || !status.active) return;

    var scale = getCanvasScale(canvas);
    var borderW = 2;
    var guideColor = getHighlightColor();

    function appendLine(x, y, w, h, color) {
      var line = document.createElement("div");
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

    var nodeMap = {};
    function trackNode(node, axis) {
      if (!node || node.id == null) return;
      var key = String(node.id);
      if (!nodeMap[key]) nodeMap[key] = { node: node, width: false, height: false };
      nodeMap[key][axis] = true;
    }

    var xNodes = status.xDidSnap ? (status.xWinnerNodes || []) : [];
    var yNodes = status.yDidSnap ? (status.yWinnerNodes || []) : [];
    for (var i = 0; i < xNodes.length; i += 1) trackNode(xNodes[i], "width");
    for (var j = 0; j < yNodes.length; j += 1) trackNode(yNodes[j], "height");

    for (var key in nodeMap) {
      if (!Object.prototype.hasOwnProperty.call(nodeMap, key)) continue;
      var item = nodeMap[key];
      var bounds = getNodeBounds(item.node);
      if (!bounds) continue;
      var topLeft = graphToClient(canvas, bounds.left, bounds.top);
      if (!topLeft) continue;
      var left = topLeft.x;
      var top = topLeft.y;
      var width = Math.max(0, (bounds.right - bounds.left) * scale);
      var height = Math.max(0, (bounds.bottom - bounds.top) * scale);

      if (item.width) {
        if (status.axis === "move") {
          var xMode = status.xMode || "";
          var anchorCanvasX = xMode.indexOf("right") !== -1 ? bounds.right : (xMode.indexOf("center") !== -1 ? bounds.left + (bounds.right - bounds.left) / 2 : bounds.left);
          var lineXClient = graphToClient(canvas, anchorCanvasX, bounds.top).x;
          if (xMode.indexOf("right") !== -1) lineXClient -= borderW; 
          appendLine(lineXClient, top, borderW, height, guideColor);
        } else {
          if (status.xMode === "edge_align_right") {
             var snappedCanvasX = status.activeLeft + status.xTarget;
             var isLeftEdge = Math.abs(snappedCanvasX - bounds.left) < Math.abs(snappedCanvasX - bounds.right);
             var anchorCanvasX = isLeftEdge ? bounds.left : bounds.right;
             var lineXClient = graphToClient(canvas, anchorCanvasX, bounds.top).x;
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
          var snapLineY = status.yLine; 
          var isTopEdge = Math.abs(snapLineY - bounds.top) < Math.abs(snapLineY - bounds.bottom);
          var anchorCanvasY = isTopEdge ? bounds.top : bounds.bottom;
          var lineYClient = graphToClient(canvas, bounds.left, anchorCanvasY).y;
          if (!isTopEdge) lineYClient -= borderW;
          appendLine(left, lineYClient, width, borderW, guideColor);
        } else {
          if (status.yMode === "edge_align_bottom") {
             var snappedCanvasY = status.activeTop + status.yTarget;
             var isTopEdge = Math.abs(snappedCanvasY - bounds.top) < Math.abs(snappedCanvasY - bounds.bottom);
             var anchorCanvasY = isTopEdge ? bounds.top : bounds.bottom;
             var lineYClient = graphToClient(canvas, bounds.left, anchorCanvasY).y;
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

  function ensureSnapFeedbackState(canvas) {
    if (!canvas) return null;
    if (!canvas.__blockSpaceSnapFeedbackState) canvas.__blockSpaceSnapFeedbackState = { pulses: {} };
    return canvas.__blockSpaceSnapFeedbackState;
  }

  function graphToClient(canvas, x, y) {
    if (!canvas || !canvas.canvas) return null;
    var rect = canvas.canvas.getBoundingClientRect();
    var scale = getCanvasScale(canvas);
    var offset = canvas.ds && canvas.ds.offset ? canvas.ds.offset : [0, 0];
    return {
      x: rect.left + (x + (Number(offset[0]) || 0)) * scale,
      y: rect.top + (y + (Number(offset[1]) || 0)) * scale,
    };
  }

  function buildSnapFeedbackPayload(xDidSnap, yDidSnap) {
    if (!xDidSnap && !yDidSnap) return null;
    if (xDidSnap && yDidSnap) return { axisLabel: "XY", color: getFeedbackColorXY() };
    if (xDidSnap) return { axisLabel: "X", color: getFeedbackColorX() };
    return { axisLabel: "Y", color: getFeedbackColorY() };
  }

  function triggerSnapFeedback(canvas, node, xDidSnap, yDidSnap) {
    if (!canvas || !node || !getFeedbackEnabled()) return;
    var payload = buildSnapFeedbackPayload(!!xDidSnap, !!yDidSnap);
    if (!payload) return;
    var state = ensureSnapFeedbackState(canvas);
    if (!state) return;
    var now = Date.now();
    var nodeId = node.id != null ? String(node.id) : null;
    if (!nodeId) return;

    var pulseMs = getFeedbackPulseMs();
    var pulse = state.pulses[nodeId];
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
    var state = canvas.__blockSpaceSnapFeedbackState;
    var pulses = state.pulses || {};
    for (var key in pulses) {
      var pulse = pulses[key];
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
    var state = ensureSnapFeedbackState(canvas);
    if (!state) return;
    var now = Date.now();
    var pulses = state.pulses || {};
    for (var key in pulses) {
      var pulse = pulses[key];
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

  function renderResizeDebugHud(canvas) {
    var s = canvas && canvas.__blockSpaceResizeDebugStatus;
    if (!s || !s.active) {
      clearDimensionAssociationLayer();
      return;
    }
    renderDimensionAssociationHighlights(canvas, s);
  }

  window.LGraphCanvas.prototype.processMouseMove = function (event) {
    if (!this.__blockSpaceResetPersistedHighlightDone) {
      resetPersistedHighlightArtifacts(this);
      this.__blockSpaceResetPersistedHighlightDone = true;
    }

    var dragSnapshot = null;
    if (this.node_dragged || (this.last_mouse_dragging && this.current_node)) {
      var primary = this.node_dragged || this.current_node;
      if (primary && primary.pos) {
        dragSnapshot = { anchor: primary, anchorX: primary.pos[0], anchorY: primary.pos[1], nodes: [] };
        if (this.selected_nodes) {
          for (var id in this.selected_nodes) {
            var n = this.selected_nodes[id];
            if (n && n.pos && n !== primary) dragSnapshot.nodes.push({ node: n, x: n.pos[0], y: n.pos[1] });
          }
        }
      }
    }

    var resizingNodeBefore = this.resizing_node || null;
    var result = originalProcessMouseMove.apply(this, arguments);
    if (event && typeof event.canvasX === "number") this.__blockSpaceCursorX = event.canvasX;
    else if (event && typeof event.clientX === "number") this.__blockSpaceCursorX = event.clientX;
    if (event && typeof event.canvasY === "number") this.__blockSpaceCursorY = event.canvasY;
    else if (event && typeof event.clientY === "number") this.__blockSpaceCursorY = event.clientY;

    if ((event && event.shiftKey) || !isSnappingEnabled()) {
      renderResizeDebugHud(this);
      updateSnapFeedback(this);
      return result;
    }

    var resizingNode = this.resizing_node || resizingNodeBefore;
    if (resizingNode && resizingNode.pos && resizingNode.size && !this.dragging_canvas) {
      var resizeDelta = getResizeDelta(this, resizingNode);
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

    var activeNode = getActiveDraggedNode(this, event);
    if (!activeNode || activeNode.constructor === window.LGraphGroup) {
      clearSnapVisual(this);
      updateSnapFeedback(this);
      this.__blockSpacePrevDragPoint = null;
      renderResizeDebugHud(this);
      return result;
    }

    var activeBounds = getNodeBounds(activeNode);
    if (!activeBounds) {
      updateSnapFeedback(this);
      return result;
    }

    var originalX = activeNode.pos[0];
    var originalY = activeNode.pos[1];
    var hSnapMargin = getHSnapMargin();
    var vSnapMargin = getVSnapMargin();
    var xSearchDistance = hSnapMargin + 10;
    var ySearchDistance = vSnapMargin + 10;
    var baseMoveThreshold = SNAP_THRESHOLD / Math.max(0.0001, getCanvasScale(this));
    var exitThresholdCanvas = baseMoveThreshold * EXIT_THRESHOLD_MULTIPLIER;
    var thresholdCanvasX = baseMoveThreshold * getMoveSnapStrength();
    var thresholdCanvasY = baseMoveThreshold * getMoveSnapStrength();

    var recentSnap = this.__blockSpaceRecentSnap;
    var wasSnappedX = recentSnap && recentSnap.kind === "move" && recentSnap.nodeId === activeNode.id && recentSnap.xDidSnap;
    var wasSnappedY = recentSnap && recentSnap.kind === "move" && recentSnap.nodeId === activeNode.id && recentSnap.yDidSnap;
    
    var currentThresholdX = wasSnappedX ? (exitThresholdCanvas * getMoveSnapStrength()) : thresholdCanvasX;
    var currentThresholdY = wasSnappedY ? (exitThresholdCanvas * getMoveSnapStrength()) : thresholdCanvasY;

    var nodes = getGraphNodes(this);
    var selectedNodesMap = this.selected_nodes || null;
    var didSnap = false;
    var xDidSnapMove = false;
    var yDidSnapMove = false;

    // --- X Axis Snapping ---
    var moveXMemory = ensureMoveXPointMemory(this, activeNode, hSnapMargin);
    var moveXClusters = moveXMemory ? buildDimensionClusters(moveXMemory.points, moveXMemory.tolerancePx) : [];
    var xWinner = pickNearestMoveCluster(moveXClusters, activeBounds.left);
    
    var xMode = null;
    var xTarget = null;
    var xDelta = Infinity;
    var xLine = null;
    var xWinnerNodes = [];

    if (xWinner) {
      xDelta = Math.abs(activeBounds.left - xWinner.center);
      xTarget = xWinner.center;
      // Heuristic for guide rendering: find if any member is a right-edge or center anchor
      xMode = "left_flush";
      var xNodeSeen = {};
      for (var xm = 0; xm < xWinner.members.length; xm++) {
        var m = xWinner.members[xm];
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

    // --- Y Axis Snapping ---
    var moveYMemory = ensureMoveYPointMemory(this, activeNode, vSnapMargin);
    var moveYClusters = moveYMemory ? buildDimensionClusters(moveYMemory.points, moveYMemory.tolerancePx) : [];
    var topWinner = pickNearestMoveCluster(moveYClusters, activeBounds.top);
    var bottomWinner = pickNearestMoveCluster(moveYClusters, activeBounds.bottom);
    var topDelta = topWinner ? Math.abs(activeBounds.top - topWinner.center) : Infinity;
    var bottomDelta = bottomWinner ? Math.abs(activeBounds.bottom - bottomWinner.center) : Infinity;

    var moveYWinner = null;
    var moveYTarget = null;
    var moveYDelta = Infinity;
    var moveYLine = null;

    if (topWinner || bottomWinner) {
      var topBias = 2; 
      if (topWinner && (!bottomWinner || (topDelta <= (bottomDelta + topBias)))) {
        moveYWinner = topWinner; moveYDelta = topDelta; moveYLine = topWinner.center; moveYTarget = topWinner.center;
      } else {
        moveYWinner = bottomWinner; moveYDelta = bottomDelta; moveYLine = bottomWinner.center; moveYTarget = bottomWinner.center - (activeBounds.bottom - activeBounds.top);
      }
    }

    var moveYWinnerNodes = [];
    if (moveYWinner && Array.isArray(moveYWinner.members)) {
      var yNodeSeen = {};
      for (var ym = 0; ym < moveYWinner.members.length; ym += 1) {
        var yNode = moveYWinner.members[ym].node;
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
      var totalMoveX = activeNode.pos[0] - dragSnapshot.anchorX;
      var totalMoveY = activeNode.pos[1] - dragSnapshot.anchorY;
      for (var i = 0; i < dragSnapshot.nodes.length; i++) {
        var entry = dragSnapshot.nodes[i];
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

  window.LGraphCanvas.prototype.processMouseUp = function (event) {
    var nodeHint = this.resizing_node || this.node_dragged || this.current_node || null;
    var result = originalProcessMouseUp.apply(this, arguments);
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
    return result;
  };

  window.LGraphCanvas.prototype.__blockSpaceNodeSnapPatched = true;
  window.BlockSpaceNodeSnap = window.BlockSpaceNodeSnap || {};
  window.BlockSpaceNodeSnap.resetPersistedHighlightArtifacts = function (canvas) {
    var targetCanvas = canvas || (window.app && window.app.canvas) || null;
    resetPersistedHighlightArtifacts(targetCanvas);
  };
  window.BlockSpaceNodeSnap.getHSnapMargin = getHSnapMargin;
  window.BlockSpaceNodeSnap.getVSnapMargin = getVSnapMargin;
})();

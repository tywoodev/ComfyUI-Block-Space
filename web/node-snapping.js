(function () {
  "use strict";

  if (typeof window.LGraphCanvas === "undefined" || !window.LGraphCanvas.prototype) {
    return;
  }
  if (window.LGraphCanvas.prototype.__blockSpaceNodeSnapPatched) {
    return;
  }

  var SNAP_THRESHOLD = 10;
  var DEFAULT_H_SNAP_MARGIN = 60;
  var DEFAULT_V_SNAP_MARGIN = 60;
  var DEFAULT_MOVE_SNAP_STRENGTH = 1.0;
  var DEFAULT_RESIZE_SNAP_STRENGTH = 1.8;
  var DEFAULT_HIGHLIGHT_ENABLED = true;
  var DEFAULT_HIGHLIGHT_COLOR = "#1a3a6b";
  var DEFAULT_FEEDBACK_ENABLED = true;
  var DEFAULT_FEEDBACK_PULSE_MS = 160;
  var DEFAULT_FEEDBACK_BADGE_MS = 260;
  var DEFAULT_FEEDBACK_BADGE_COOLDOWN_MS = 200;
  var DEFAULT_FEEDBACK_COLOR_X = "#1a3a6b";
  var DEFAULT_FEEDBACK_COLOR_Y = "#b57cff";
  var DEFAULT_FEEDBACK_COLOR_XY = "#1a6b35";
  var DEFAULT_FEEDBACK_BADGE_BG = "#0f172a";
  var DEFAULT_FEEDBACK_BADGE_TEXT = "#e5f1ff";
  var V_SNAP_MARGIN_VISUAL_MULTIPLIER = 1.75;
  var WINNER_HIGHLIGHT_BG_FALLBACK = "#3a3f47";
  var DEBUG_RESIZE_SNAPPING = false;
  var RESIZE_SEARCH_DISTANCE_MULTIPLIER = 4;
  var SNAP_MOUSEUP_GRACE_MS = 220;
  var SNAP_MOUSEUP_TOLERANCE_MULTIPLIER = 1.8;
  var DEBUG_HUD_ID = "block-space-resize-debug-hud";
  var SNAP_BADGE_LAYER_ID = "block-space-snap-badge-layer";

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
      getSettingValue(
        "comfyuiBlockSpace.nodeSnap.hMarginPx",
        getSettingValue("comfyuiBlockSpace.nodeSnap.marginPx", DEFAULT_H_SNAP_MARGIN)
      ),
      0,
      500,
      DEFAULT_H_SNAP_MARGIN
    );
  }

  function getVSnapMargin() {
    var base = clampNumber(
      getSettingValue(
        "comfyuiBlockSpace.nodeSnap.vMarginPx",
        getSettingValue("comfyuiBlockSpace.nodeSnap.marginPx", DEFAULT_V_SNAP_MARGIN)
      ),
      0,
      500,
      DEFAULT_V_SNAP_MARGIN
    );
    return clampNumber(base * V_SNAP_MARGIN_VISUAL_MULTIPLIER, 0, 1000, DEFAULT_V_SNAP_MARGIN);
  }

  function getMoveSnapStrength() {
    return clampNumber(
      getSettingValue("comfyuiBlockSpace.nodeSnap.moveStrength", DEFAULT_MOVE_SNAP_STRENGTH),
      0.1,
      5,
      DEFAULT_MOVE_SNAP_STRENGTH
    );
  }

  function getResizeSnapStrength() {
    return clampNumber(
      getSettingValue("comfyuiBlockSpace.nodeSnap.resizeStrength", DEFAULT_RESIZE_SNAP_STRENGTH),
      0.1,
      5,
      DEFAULT_RESIZE_SNAP_STRENGTH
    );
  }

  function getHighlightEnabled() {
    return !!getSettingValue("comfyuiBlockSpace.nodeSnap.highlightEnabled", DEFAULT_HIGHLIGHT_ENABLED);
  }

  function getHighlightColor() {
    var value = getSettingValue("comfyuiBlockSpace.nodeSnap.highlightColor", DEFAULT_HIGHLIGHT_COLOR);
    return typeof value === "string" && value.trim() ? value.trim() : DEFAULT_HIGHLIGHT_COLOR;
  }

  function getFeedbackEnabled() {
    return !!getSettingValue("comfyuiBlockSpace.nodeSnap.feedbackEnabled", DEFAULT_FEEDBACK_ENABLED);
  }

  function getFeedbackPulseMs() {
    return clampNumber(
      getSettingValue("comfyuiBlockSpace.nodeSnap.feedbackPulseMs", DEFAULT_FEEDBACK_PULSE_MS),
      60,
      3000,
      DEFAULT_FEEDBACK_PULSE_MS
    );
  }

  function getFeedbackBadgeMs() {
    return clampNumber(
      getSettingValue("comfyuiBlockSpace.nodeSnap.feedbackBadgeMs", DEFAULT_FEEDBACK_BADGE_MS),
      80,
      5000,
      DEFAULT_FEEDBACK_BADGE_MS
    );
  }

  function getFeedbackBadgeCooldownMs() {
    return clampNumber(
      getSettingValue("comfyuiBlockSpace.nodeSnap.feedbackBadgeCooldownMs", DEFAULT_FEEDBACK_BADGE_COOLDOWN_MS),
      0,
      5000,
      DEFAULT_FEEDBACK_BADGE_COOLDOWN_MS
    );
  }

  function getFeedbackColorX() {
    var value = getSettingValue("comfyuiBlockSpace.nodeSnap.feedbackColorX", DEFAULT_FEEDBACK_COLOR_X);
    return typeof value === "string" && value.trim() ? value.trim() : DEFAULT_FEEDBACK_COLOR_X;
  }

  function getFeedbackColorY() {
    var value = getSettingValue("comfyuiBlockSpace.nodeSnap.feedbackColorY", DEFAULT_FEEDBACK_COLOR_Y);
    return typeof value === "string" && value.trim() ? value.trim() : DEFAULT_FEEDBACK_COLOR_Y;
  }

  function getFeedbackColorXY() {
    var value = getSettingValue("comfyuiBlockSpace.nodeSnap.feedbackColorXY", DEFAULT_FEEDBACK_COLOR_XY);
    return typeof value === "string" && value.trim() ? value.trim() : DEFAULT_FEEDBACK_COLOR_XY;
  }

  function getFeedbackBadgeBgColor() {
    var value = getSettingValue("comfyuiBlockSpace.nodeSnap.feedbackBadgeBg", DEFAULT_FEEDBACK_BADGE_BG);
    return typeof value === "string" && value.trim() ? value.trim() : DEFAULT_FEEDBACK_BADGE_BG;
  }

  function getFeedbackBadgeTextColor() {
    var value = getSettingValue("comfyuiBlockSpace.nodeSnap.feedbackBadgeText", DEFAULT_FEEDBACK_BADGE_TEXT);
    return typeof value === "string" && value.trim() ? value.trim() : DEFAULT_FEEDBACK_BADGE_TEXT;
  }

  function getNodeBounds(node) {
    if (!node || !node.pos || !node.size) {
      return null;
    }
    var left = Number(node.pos[0]) || 0;
    var top = Number(node.pos[1]) || 0;
    var width = Math.max(0, Number(node.size[0]) || 0);
    var height = Math.max(0, Number(node.size[1]) || 0);
    return {
      left: left,
      right: left + width,
      top: top,
      bottom: top + height,
      centerX: left + width * 0.5,
      centerY: top + height * 0.5,
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

  function resolveDragAxisLock(canvas, dragDelta) {
    if (!canvas) {
      return null;
    }
    if (canvas.__blockSpaceDragAxisLock) {
      return canvas.__blockSpaceDragAxisLock;
    }
    if (!dragDelta || (dragDelta.dx === 0 && dragDelta.dy === 0)) {
      return null;
    }
    canvas.__blockSpaceDragAxisLock =
      Math.abs(dragDelta.dx) >= Math.abs(dragDelta.dy) ? "x" : "y";
    return canvas.__blockSpaceDragAxisLock;
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
    ignoreMaxSearchDistance
  ) {
    var valid = [];
    for (var i = 0; i < allNodes.length; i += 1) {
      var target = allNodes[i];
      if (!target || target === activeNode || target.constructor === window.LGraphGroup) {
        continue;
      }
      var targetBounds = getNodeBounds(target);
      if (!targetBounds) {
        continue;
      }
      var emptySpace = 0;
      if (axis === "x") {
        if (direction === "left") {
          if (!(targetBounds.centerX < activeBounds.centerX)) {
            continue;
          }
          emptySpace = activeBounds.left - targetBounds.right;
        } else {
          if (!(targetBounds.centerX > activeBounds.centerX)) {
            continue;
          }
          emptySpace = targetBounds.left - activeBounds.right;
        }
        // Side-by-side snapping must share vertical band overlap.
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
        // Vertical stacking snapping must share horizontal band overlap.
        if (!rangesOverlap(activeBounds.left, activeBounds.right, targetBounds.left, targetBounds.right, 0)) {
          continue;
        }
      }
      // Must be an actual gap in-range; reject overlap/penetration.
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
    xSortByGap
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
      ignoreMaxSearchDistance
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
          ignoreMaxSearchDistance
        );
      }
    }

    if (!valid.length) {
      return null;
    }

    valid.sort(function (a, b) {
      if (axis === "x" && xSortByGap) {
        var aGap = a.direction === "left" ? activeBounds.left - a.bounds.right : a.bounds.left - activeBounds.right;
        var bGap = b.direction === "left" ? activeBounds.left - b.bounds.right : b.bounds.left - activeBounds.right;
        if (aGap !== bGap) {
          return aGap - bGap;
        }
        var aVertical = Math.abs(activeBounds.centerY - a.bounds.centerY);
        var bVertical = Math.abs(activeBounds.centerY - b.bounds.centerY);
        if (aVertical !== bVertical) {
          return aVertical - bVertical;
        }
      }
      return a.distance - b.distance;
    });

    return valid[0];
  }

  function chooseBelowByXProximity(activeNode, activeBounds, allNodes, maxSearchDistance, ignoreMaxSearchDistance) {
    var valid = [];
    for (var i = 0; i < allNodes.length; i += 1) {
      var target = allNodes[i];
      if (!target || target === activeNode || target.constructor === window.LGraphGroup) {
        continue;
      }
      var targetBounds = getNodeBounds(target);
      if (!targetBounds) {
        continue;
      }
      if (!(targetBounds.centerY > activeBounds.centerY)) {
        continue;
      }
      var verticalGap = targetBounds.top - activeBounds.bottom;
      if (!(verticalGap >= 0 && (ignoreMaxSearchDistance || verticalGap <= maxSearchDistance))) {
        continue;
      }
      valid.push({
        node: target,
        bounds: targetBounds,
        xDistance: Math.abs(activeBounds.centerX - targetBounds.centerX),
        yDistance: Math.abs(activeBounds.top - targetBounds.top),
      });
    }

    if (!valid.length) {
      return null;
    }

    valid.sort(function (a, b) {
      if (a.xDistance !== b.xDistance) {
        return a.xDistance - b.xDistance;
      }
      return a.yDistance - b.yDistance;
    });
    return valid[0];
  }

  function chooseAboveByXProximity(activeNode, activeBounds, allNodes, maxSearchDistance, ignoreMaxSearchDistance) {
    var valid = [];
    for (var i = 0; i < allNodes.length; i += 1) {
      var target = allNodes[i];
      if (!target || target === activeNode || target.constructor === window.LGraphGroup) {
        continue;
      }
      var targetBounds = getNodeBounds(target);
      if (!targetBounds) {
        continue;
      }
      if (!(targetBounds.centerY < activeBounds.centerY)) {
        continue;
      }
      var verticalGap = activeBounds.top - targetBounds.bottom;
      if (!(verticalGap >= 0 && (ignoreMaxSearchDistance || verticalGap <= maxSearchDistance))) {
        continue;
      }
      valid.push({
        node: target,
        bounds: targetBounds,
        xDistance: Math.abs(activeBounds.centerX - targetBounds.centerX),
        yDistance: Math.abs(activeBounds.top - targetBounds.top),
      });
    }

    if (!valid.length) {
      return null;
    }

    valid.sort(function (a, b) {
      if (a.xDistance !== b.xDistance) {
        return a.xDistance - b.xDistance;
      }
      return a.yDistance - b.yDistance;
    });
    return valid[0];
  }

  function chooseBelowTopByReferenceY(activeNode, activeBounds, allNodes, referenceY, maxSearchDistance) {
    if (!isFinite(referenceY)) {
      return null;
    }
    // For down-intent resizing, never consider a "below" target that is above
    // the node's current bottom edge, even if cursor reference jitters upward.
    var floorY = Math.max(referenceY, activeBounds && isFinite(activeBounds.bottom) ? activeBounds.bottom : referenceY);
    var valid = [];
    for (var i = 0; i < allNodes.length; i += 1) {
      var target = allNodes[i];
      if (!target || target === activeNode || target.constructor === window.LGraphGroup) {
        continue;
      }
      var targetBounds = getNodeBounds(target);
      if (!targetBounds) {
        continue;
      }
      if (!rangesOverlap(activeBounds.left, activeBounds.right, targetBounds.left, targetBounds.right, 0)) {
        continue;
      }
      if (!(targetBounds.top >= floorY)) {
        continue;
      }
      var distance = targetBounds.top - floorY;
      if (!(distance >= 0 && distance <= maxSearchDistance)) {
        continue;
      }
      valid.push({
        node: target,
        bounds: targetBounds,
        distance: distance,
      });
    }
    if (!valid.length) {
      return null;
    }
    valid.sort(function (a, b) {
      if (a.distance !== b.distance) {
        return a.distance - b.distance;
      }
      return Math.abs(activeBounds.centerX - a.bounds.centerX) - Math.abs(activeBounds.centerX - b.bounds.centerX);
    });
    return valid[0];
  }

  function chooseAdjacentAboveBottomByReferenceY(activeNode, activeBounds, allNodes, referenceY, maxSearchDistance) {
    if (!isFinite(referenceY)) {
      return null;
    }
    var left = [];
    var right = [];
    for (var i = 0; i < allNodes.length; i += 1) {
      var target = allNodes[i];
      if (!target || target === activeNode || target.constructor === window.LGraphGroup) {
        continue;
      }
      var targetBounds = getNodeBounds(target);
      if (!targetBounds) {
        continue;
      }
      var side = null;
      var horizontalGap = 0;
      if (targetBounds.centerX < activeBounds.centerX) {
        side = "left";
        horizontalGap = activeBounds.left - targetBounds.right;
      } else if (targetBounds.centerX > activeBounds.centerX) {
        side = "right";
        horizontalGap = targetBounds.left - activeBounds.right;
      } else {
        continue;
      }
      // Treat overlap as immediate adjacency for vertical resize snapping.
      var effectiveHorizontalGap = horizontalGap < 0 ? 0 : horizontalGap;
      if (!(effectiveHorizontalGap <= maxSearchDistance)) {
        continue;
      }
      if (!(targetBounds.bottom <= referenceY)) {
        continue;
      }
      var verticalDelta = referenceY - targetBounds.bottom;
      var candidate = {
        node: target,
        bounds: targetBounds,
        side: side,
        distance: verticalDelta,
        horizontalGap: effectiveHorizontalGap,
      };
      if (side === "left") {
        left.push(candidate);
      } else {
        right.push(candidate);
      }
    }

    function sortCandidates(list) {
      list.sort(function (a, b) {
        if (a.distance !== b.distance) {
          return a.distance - b.distance;
        }
        return a.horizontalGap - b.horizontalGap;
      });
      return list.length ? list[0] : null;
    }

    var leftBest = sortCandidates(left);
    var rightBest = sortCandidates(right);
    if (leftBest && rightBest) {
      if (leftBest.distance !== rightBest.distance) {
        return leftBest.distance < rightBest.distance ? leftBest : rightBest;
      }
      if (leftBest.horizontalGap !== rightBest.horizontalGap) {
        return leftBest.horizontalGap <= rightBest.horizontalGap ? leftBest : rightBest;
      }
      return leftBest; // stable tie-breaker: left wins
    }
    return leftBest || rightBest || null;
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

  function buildStickyYResizeCandidate(mode, activeBounds, yReferenceBounds, winnerBounds, snapMargin) {
    if (!winnerBounds) {
      return null;
    }
    if (mode === "below_top" || mode === "below_top_x_proximity") {
      if (!(winnerBounds.centerY > activeBounds.centerY)) {
        return null;
      }
      return {
        targetBottom: winnerBounds.top - snapMargin,
        delta: Math.abs(yReferenceBounds.bottom - (winnerBounds.top - snapMargin)),
        mode: mode,
      };
    }
    if (mode === "below_bottom_x_proximity") {
      if (!(winnerBounds.centerY > activeBounds.centerY)) {
        return null;
      }
      return {
        targetBottom: winnerBounds.bottom,
        delta: Math.abs(yReferenceBounds.bottom - winnerBounds.bottom),
        mode: mode,
      };
    }
    if (mode === "left_bottom") {
      if (!(winnerBounds.centerX < activeBounds.centerX)) {
        return null;
      }
      return {
        targetBottom: winnerBounds.bottom,
        delta: Math.abs(yReferenceBounds.bottom - winnerBounds.bottom),
        mode: mode,
      };
    }
    if (mode === "right_bottom") {
      if (!(winnerBounds.centerX > activeBounds.centerX)) {
        return null;
      }
      return {
        targetBottom: winnerBounds.bottom,
        delta: Math.abs(yReferenceBounds.bottom - winnerBounds.bottom),
        mode: mode,
      };
    }
    if (mode === "left_top_if_below") {
      if (!(winnerBounds.centerX < activeBounds.centerX && winnerBounds.centerY > activeBounds.centerY)) {
        return null;
      }
      return {
        targetBottom: winnerBounds.top,
        delta: Math.abs(yReferenceBounds.bottom - winnerBounds.top),
        mode: mode,
      };
    }
    if (mode === "right_top_if_below") {
      if (!(winnerBounds.centerX > activeBounds.centerX && winnerBounds.centerY > activeBounds.centerY)) {
        return null;
      }
      return {
        targetBottom: winnerBounds.top,
        delta: Math.abs(yReferenceBounds.bottom - winnerBounds.top),
        mode: mode,
      };
    }
    if (mode === "above_bottom") {
      if (!(winnerBounds.centerY < activeBounds.centerY)) {
        return null;
      }
      return {
        targetBottom: winnerBounds.bottom,
        delta: Math.abs(yReferenceBounds.bottom - winnerBounds.bottom),
        mode: mode,
      };
    }
    if (mode === "left_top") {
      if (!(winnerBounds.centerX < activeBounds.centerX)) {
        return null;
      }
      return {
        targetBottom: winnerBounds.top,
        delta: Math.abs(yReferenceBounds.bottom - winnerBounds.top),
        mode: mode,
      };
    }
    if (mode === "right_top") {
      if (!(winnerBounds.centerX > activeBounds.centerX)) {
        return null;
      }
      return {
        targetBottom: winnerBounds.top,
        delta: Math.abs(yReferenceBounds.bottom - winnerBounds.top),
        mode: mode,
      };
    }
    if (mode === "left_bottom_if_above") {
      if (!(winnerBounds.centerX < activeBounds.centerX && winnerBounds.centerY < activeBounds.centerY)) {
        return null;
      }
      return {
        targetBottom: winnerBounds.bottom,
        delta: Math.abs(yReferenceBounds.bottom - winnerBounds.bottom),
        mode: mode,
      };
    }
    if (mode === "right_bottom_if_above") {
      if (!(winnerBounds.centerX > activeBounds.centerX && winnerBounds.centerY < activeBounds.centerY)) {
        return null;
      }
      return {
        targetBottom: winnerBounds.bottom,
        delta: Math.abs(yReferenceBounds.bottom - winnerBounds.bottom),
        mode: mode,
      };
    }
    if (mode === "above_top_x_proximity") {
      if (!(winnerBounds.centerY < activeBounds.centerY)) {
        return null;
      }
      return {
        targetBottom: winnerBounds.top,
        delta: Math.abs(yReferenceBounds.bottom - winnerBounds.top),
        mode: mode,
      };
    }
    return null;
  }

  function getResizeYIntent(canvas, nodeId, currentBottom) {
    if (!canvas || nodeId == null || !isFinite(currentBottom)) {
      return "neutral";
    }
    var state = canvas.__blockSpaceResizeYIntentState;
    if (!state || state.nodeId !== nodeId || !isFinite(state.prevBottom)) {
      canvas.__blockSpaceResizeYIntentState = {
        nodeId: nodeId,
        prevBottom: currentBottom,
        intent: "neutral",
      };
      return "neutral";
    }
    var delta = currentBottom - state.prevBottom;
    state.prevBottom = currentBottom;
    if (Math.abs(delta) <= 0.1) {
      canvas.__blockSpaceResizeYIntentState = state;
      return state.intent || "neutral";
    }
    state.intent = delta > 0 ? "down" : "up";
    canvas.__blockSpaceResizeYIntentState = state;
    return state.intent;
  }

  function computeWinningXCandidate(activeBounds, winner, snapMargin, useLeftAlignOnly) {
    var winnerBounds = winner.bounds;
    if (useLeftAlignOnly) {
      var alignTargetX = winnerBounds.left;
      return {
        targetX: alignTargetX,
        delta: Math.abs(activeBounds.left - alignTargetX),
        mode: "top_bottom_left_align",
      };
    }
    var side = winner.direction || "left";
    var marginTargetX =
      side === "left"
        ? winnerBounds.right + snapMargin
        : winnerBounds.left - snapMargin - (activeBounds.right - activeBounds.left);
    var marginDelta = Math.abs(activeBounds.left - marginTargetX);
    var leftTargetX = winnerBounds.left;
    var leftDelta = Math.abs(activeBounds.left - leftTargetX);

    if (marginDelta <= leftDelta) {
      return {
        targetX: marginTargetX,
        delta: marginDelta,
        mode: "margin",
      };
    }
    return {
      targetX: leftTargetX,
      delta: leftDelta,
      mode: "left_align",
    };
  }

  function computeWinningYCandidate(activeBounds, winner, snapMargin, useTopFlushOnly) {
    var winnerBounds = winner.bounds;
    if (useTopFlushOnly) {
      var flushTargetY = winnerBounds.top;
      return {
        targetY: flushTargetY,
        delta: Math.abs(activeBounds.top - flushTargetY),
        mode: "left_top_flush",
      };
    }
    var direction = winner.direction || "above";
    var marginTargetY =
      direction === "above"
        ? winnerBounds.bottom + snapMargin
        : winnerBounds.top - snapMargin - (activeBounds.bottom - activeBounds.top);
    var marginDelta = Math.abs(activeBounds.top - marginTargetY);
    var topTargetY = winnerBounds.top;
    var topDelta = Math.abs(activeBounds.top - topTargetY);

    if (marginDelta <= topDelta) {
      return {
        targetY: marginTargetY,
        delta: marginDelta,
        mode: "margin",
      };
    }
    return {
      targetY: topTargetY,
      delta: topDelta,
      mode: "top_align",
    };
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

  function resolveResizeAxisLock(canvas, resizeDelta) {
    if (!canvas) {
      return "both";
    }
    if (canvas.__blockSpaceResizeAxisLock) {
      return canvas.__blockSpaceResizeAxisLock;
    }
    if (!resizeDelta) {
      return "both";
    }
    var absW = Math.abs(resizeDelta.dw);
    var absH = Math.abs(resizeDelta.dh);
    if (absW < 0.01 && absH < 0.01) {
      return "both";
    }
    canvas.__blockSpaceResizeAxisLock = absW >= absH ? "x" : "y";
    return canvas.__blockSpaceResizeAxisLock;
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

    // Avoid using computeSize when smart-sizing tracks user-resized size,
    // otherwise minimums can become equal to current size and block shrink snaps.
    if (!hasSmartMin && typeof node.computeSize === "function") {
      try {
        var computed = node.computeSize(node.size && node.size.length >= 1 ? node.size[0] : undefined);
        if (computed && computed.length >= 2) {
          minWidth = Math.max(minWidth, Number(computed[0]) || minWidth);
          minHeight = Math.max(minHeight, Number(computed[1]) || minHeight);
        }
      } catch (error) {
        // Ignore compute size failures and keep conservative fallback minimum.
      }
    }

    return [minWidth, minHeight];
  }

  function computeWinningXResizeCandidate(
    activeBounds,
    winner,
    snapMargin,
    useTopBottomFallback,
    enableTopBottomHalfSpan
  ) {
    var winnerBounds = winner.bounds;
    if (useTopBottomFallback) {
      // For top/bottom fallback during resize, align right edge to right edge.
      var fallbackTargetRight = winnerBounds.right;
      var fallbackCandidate = {
        targetRight: fallbackTargetRight,
        delta: Math.abs(activeBounds.right - fallbackTargetRight),
        mode: "top_bottom_right_align",
      };

      if (!enableTopBottomHalfSpan) {
        return fallbackCandidate;
      }

      var winnerWidth = Math.max(0, winnerBounds.right - winnerBounds.left);
      var spanTargetRight = winnerBounds.left + winnerWidth * 0.5 - snapMargin * 0.5;
      var spanCandidate = {
        targetRight: spanTargetRight,
        delta: Math.abs(activeBounds.right - spanTargetRight),
        mode: "top_bottom_half_span",
      };

      if (
        spanCandidate.delta < fallbackCandidate.delta ||
        spanCandidate.delta === fallbackCandidate.delta
      ) {
        return spanCandidate;
      }
      return fallbackCandidate;
    }

    var side = winner.direction || "left";
    if (side === "left") {
      var winnerWidth = Math.max(0, winnerBounds.right - winnerBounds.left);
      var widthMatchTargetRight = activeBounds.left + winnerWidth;
      return {
        targetRight: widthMatchTargetRight,
        delta: Math.abs(activeBounds.right - widthMatchTargetRight),
        mode: "left_width_match",
      };
    }
    var marginTargetRight = side === "left" ? winnerBounds.right + snapMargin : winnerBounds.left - snapMargin;
    var alignTargetRight = winnerBounds.left;
    var marginDelta = Math.abs(activeBounds.right - marginTargetRight);
    var alignDelta = Math.abs(activeBounds.right - alignTargetRight);

    if (marginDelta <= alignDelta) {
      return {
        targetRight: marginTargetRight,
        delta: marginDelta,
        mode: "margin",
      };
    }
    return {
      targetRight: alignTargetRight,
      delta: alignDelta,
      mode: "right_align",
    };
  }

  function computeWinningYResizeCandidate(activeBounds, winner, snapMargin, useTopFlushOnly) {
    var winnerBounds = winner.bounds;
    if (useTopFlushOnly) {
      var flushTargetBottom = winnerBounds.top;
      return {
        targetBottom: flushTargetBottom,
        delta: Math.abs(activeBounds.bottom - flushTargetBottom),
        mode: "top_flush",
      };
    }

    var direction = winner.direction || "above";
    var marginTargetBottom = direction === "above" ? winnerBounds.bottom + snapMargin : winnerBounds.top - snapMargin;
    var alignTargetBottom = winnerBounds.top;
    var marginDelta = Math.abs(activeBounds.bottom - marginTargetBottom);
    var alignDelta = Math.abs(activeBounds.bottom - alignTargetBottom);

    if (marginDelta <= alignDelta) {
      return {
        targetBottom: marginTargetBottom,
        delta: marginDelta,
        mode: "margin",
      };
    }
    return {
      targetBottom: alignTargetBottom,
      delta: alignDelta,
      mode: "bottom_align",
    };
  }

  function applyResizeSnapping(canvas, resizingNode, resizeAxisLock, resizeDelta) {
    if (
      !canvas ||
      !resizingNode ||
      resizingNode.constructor === window.LGraphGroup ||
      resizingNode.__smartGridManaged
    ) {
      return false;
    }

    var bounds = getNodeBounds(resizingNode);
    if (!bounds) {
      return false;
    }
    var xReferenceBounds = {
      left: bounds.right,
      right: bounds.right,
      top: bounds.top,
      bottom: bounds.bottom,
      centerX: bounds.right,
      centerY: bounds.centerY,
    };
    var yReferenceBounds = {
      left: bounds.left,
      right: bounds.right,
      top: bounds.bottom,
      bottom: bounds.bottom,
      centerX: bounds.centerX,
      centerY: bounds.bottom,
    };

    var hSnapMargin = getHSnapMargin();
    var vSnapMargin = getVSnapMargin();
    var xSearchDistance = hSnapMargin * RESIZE_SEARCH_DISTANCE_MULTIPLIER;
    var ySearchDistance = vSnapMargin * RESIZE_SEARCH_DISTANCE_MULTIPLIER;
    var thresholdCanvas =
      (SNAP_THRESHOLD / Math.max(0.0001, getCanvasScale(canvas))) * getResizeSnapStrength();
    var thresholdXCanvas = thresholdCanvas;
    var nodes = getGraphNodes(canvas);
    var didSnap = false;

    var xWinner = chooseWinningTargetForAxis(
      resizingNode,
      xReferenceBounds,
      nodes,
      xSearchDistance,
      "x",
      "left",
      null,
      false,
      true
    );
    var xUseTopBottomFallback = false;
    if (!xWinner) {
      xWinner = chooseWinningTargetForAxis(
        resizingNode,
        bounds,
        nodes,
        ySearchDistance,
        "y",
        "above",
        null,
        true
      );
      xUseTopBottomFallback = !!xWinner;
    }
    if (!xWinner) {
      xWinner = chooseWinningTargetForAxis(
        resizingNode,
        bounds,
        nodes,
        ySearchDistance,
        "y",
        "below",
        null,
        true
      );
      xUseTopBottomFallback = !!xWinner;
    }
    if (!xWinner) {
      xWinner = chooseWinningTargetForAxis(
        resizingNode,
        xReferenceBounds,
        nodes,
        xSearchDistance,
        "x",
        "right",
        null,
        false,
        true
      );
    }
    // Final fallback for X resize winner: always use left node with relaxed distance.
    if (!xWinner) {
      xWinner = chooseWinningTargetForAxis(
        resizingNode,
        xReferenceBounds,
        nodes,
        xSearchDistance,
        "x",
        "left",
        null,
        true,
        true
      );
    }
    var xCandidate = xWinner
      ? computeWinningXResizeCandidate(
          bounds,
          xWinner,
          hSnapMargin,
          xUseTopBottomFallback,
          xUseTopBottomFallback && resizeDelta && resizeDelta.dw > 0
        )
      : null;

    var minSize = getNodeMinSize(resizingNode);
    // Always allow X/Y resize snapping regardless of axis lock.
    var applyX = true;
    var applyY = true;
    var status = {
      active: true,
      node: resizingNode && (resizingNode.title || resizingNode.type || resizingNode.id),
      axis: resizeAxisLock || "both",
      xWinner: xWinner && xWinner.node ? (xWinner.node.title || xWinner.node.type || xWinner.node.id) : null,
      xMode: xCandidate ? xCandidate.mode : null,
      xDelta: xCandidate ? xCandidate.delta : null,
      xThreshold: thresholdXCanvas,
      xReference: bounds.right,
      xTarget: xCandidate ? xCandidate.targetRight : null,
      yWinner: null,
      yMode: null,
      yDelta: null,
      yThreshold: thresholdCanvas,
      yReference: yReferenceBounds.bottom,
      yTarget: null,
      xDidSnap: false,
      yDidSnap: false,
      didSnap: false,
    };

    if (xWinner && applyX) {
      if (xCandidate.delta <= thresholdXCanvas) {
        var currentWidth = Number(resizingNode.size[0]) || 0;
        var nextWidth = Math.max(minSize[0], xCandidate.targetRight - bounds.left);
        status.xTarget = xCandidate.targetRight;
        if (isFinite(nextWidth) && Math.abs(nextWidth - currentWidth) > 0.01) {
          resizingNode.size[0] = nextWidth;
          didSnap = true;
          status.xDidSnap = true;
          status.xReference = bounds.left + nextWidth;
        }
      }
    }

    // Recompute bounds after potential width snap before evaluating Y.
    bounds = getNodeBounds(resizingNode) || bounds;
    yReferenceBounds = {
      left: bounds.left,
      right: bounds.right,
      top: bounds.bottom,
      bottom: bounds.bottom,
      centerX: bounds.centerX,
      centerY: bounds.bottom,
    };
    status.yReference = yReferenceBounds.bottom;

    var yIntent = getResizeYIntent(canvas, resizingNode.id, yReferenceBounds.bottom);

    function pickYResizeCandidate(intent, referenceY) {
      var winner = null;
      var candidate = null;

      if (intent === "up") {
        // Up-intent Y resize snapping disabled to avoid jumpy winner churn.
        return { winner: null, candidate: null };
      } else {
        // 1) Top of any node below current reference Y.
        winner = chooseBelowTopByReferenceY(
          resizingNode,
          bounds,
          nodes,
          referenceY,
          ySearchDistance
        );
        if (winner) {
          candidate = {
            targetBottom: winner.bounds.top - vSnapMargin,
            delta: Math.abs(yReferenceBounds.bottom - (winner.bounds.top - vSnapMargin)),
            mode: "below_top",
          };
          return { winner: winner, candidate: candidate };
        }

        // 2) Bottom of any adjacent node above current reference Y.
        winner = chooseAdjacentAboveBottomByReferenceY(
          resizingNode,
          bounds,
          nodes,
          referenceY,
          xSearchDistance
        );
        if (winner) {
          candidate = {
            targetBottom: winner.bounds.bottom,
            delta: Math.abs(yReferenceBounds.bottom - winner.bounds.bottom),
            mode: winner.side === "left" ? "left_bottom" : "right_bottom",
          };
          return { winner: winner, candidate: candidate };
        }
      }

      return { winner: null, candidate: null };
    }

    var yWinner = null;
    var yCandidate = null;
    var usedStickyYWinner = false;

    var stickyY = canvas.__blockSpaceResizeYSticky;
    if (
      stickyY &&
      stickyY.nodeId === resizingNode.id &&
      stickyY.winnerId != null &&
      stickyY.mode &&
      stickyY.intent === yIntent &&
      yIntent !== "up"
    ) {
      var stickyWinnerNode = getNodeById(nodes, stickyY.winnerId);
      var stickyWinnerBounds = getNodeBounds(stickyWinnerNode);
      var stickyCandidate = buildStickyYResizeCandidate(
        stickyY.mode,
        bounds,
        yReferenceBounds,
        stickyWinnerBounds,
        vSnapMargin
      );
      // While dragging down, drop sticky winner once we move clearly past its snap target.
      if (
        stickyCandidate &&
        yIntent === "down" &&
        yReferenceBounds.bottom > stickyCandidate.targetBottom + thresholdCanvas
      ) {
        stickyCandidate = null;
      }
      if (stickyWinnerNode && stickyWinnerBounds && stickyCandidate) {
        yWinner = { node: stickyWinnerNode, bounds: stickyWinnerBounds };
        yCandidate = stickyCandidate;
        usedStickyYWinner = true;
      }
    }

    if (!yWinner) {
      var yReferenceForWinner =
        isFinite(canvas.__blockSpaceCursorY) ? Number(canvas.__blockSpaceCursorY) : yReferenceBounds.bottom;
      var yResult = pickYResizeCandidate(yIntent, yReferenceForWinner);
      yWinner = yResult.winner;
      yCandidate = yResult.candidate;
    }

    if (yWinner && yCandidate) {
      status.yWinner = yWinner.node
        ? (yWinner.node.title || yWinner.node.type || yWinner.node.id)
        : null;
      status.yMode = yCandidate.mode;
      status.yDelta = yCandidate.delta;
      status.yTarget = yCandidate.targetBottom;

      if (applyY && yCandidate.delta <= thresholdCanvas) {
        var currentHeight = Number(resizingNode.size[1]) || 0;
        var nextHeight = Math.max(minSize[1], yCandidate.targetBottom - bounds.top);
        if (isFinite(nextHeight) && Math.abs(nextHeight - currentHeight) > 0.01) {
          resizingNode.size[1] = nextHeight;
          didSnap = true;
          status.yDidSnap = true;
          status.yReference = bounds.top + nextHeight;
        }
      }
      canvas.__blockSpaceResizeYSticky = {
        nodeId: resizingNode.id,
        winnerId: yWinner.node && yWinner.node.id != null ? yWinner.node.id : null,
        mode: yCandidate.mode,
        intent: yIntent,
      };
    } else {
      canvas.__blockSpaceResizeYSticky = null;
    }
    status.ySticky = usedStickyYWinner;
    status.yIntent = yIntent;
    status.didSnap = didSnap;
    canvas.__blockSpaceResizeDebugStatus = status;

    if (didSnap) {
      rememberRecentSnap(canvas, {
        kind: "resize",
        nodeId: resizingNode.id,
        threshold: thresholdCanvas,
        xDidSnap: !!status.xDidSnap,
        yDidSnap: !!status.yDidSnap,
        xTargetRight: status.xDidSnap ? status.xTarget : null,
        yTargetBottom: status.yDidSnap ? status.yTarget : null,
      });
      triggerSnapFeedback(canvas, resizingNode, !!status.xDidSnap, !!status.yDidSnap);
      canvas.dirty_canvas = true;
      canvas.dirty_bgcanvas = true;
    }
    return didSnap;
  }

  function clearSnapVisual(canvas) {
    if (!canvas || !canvas.__blockSpaceWinnerHighlight) {
      return;
    }
    var state = canvas.__blockSpaceWinnerHighlight;
    if (state.node) {
      if (state.hadBoxcolor) {
        state.node.boxcolor = state.boxcolor;
      } else {
        delete state.node.boxcolor;
      }
    }
    canvas.__blockSpaceWinnerHighlight = null;
    canvas.dirty_canvas = true;
    canvas.dirty_bgcanvas = true;
  }

  function resetPersistedHighlightArtifacts(canvas) {
    clearSnapFeedbackState(canvas, true);
    if (!canvas) {
      return;
    }
    var nodes = getGraphNodes(canvas);
    if (!nodes.length) {
      return;
    }
    var normalizedHighlight = String(getHighlightColor() || "").trim().toLowerCase();
    var normalizedFallbackBg = WINNER_HIGHLIGHT_BG_FALLBACK.toLowerCase();
    var normalizedFeedbackX = normalizeColor(getFeedbackColorX());
    var normalizedFeedbackY = normalizeColor(getFeedbackColorY());
    var normalizedFeedbackXY = normalizeColor(getFeedbackColorXY());
    var changed = false;
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      if (!node || node.constructor === window.LGraphGroup) {
        continue;
      }
      if (
        Object.prototype.hasOwnProperty.call(node, "boxcolor") &&
        (normalizeColor(node.boxcolor) === normalizedHighlight ||
          normalizeColor(node.boxcolor) === normalizedFeedbackX ||
          normalizeColor(node.boxcolor) === normalizedFeedbackY ||
          normalizeColor(node.boxcolor) === normalizedFeedbackXY)
      ) {
        delete node.boxcolor;
        changed = true;
      }
      if (
        Object.prototype.hasOwnProperty.call(node, "bgcolor") &&
        String(node.bgcolor || "").trim().toLowerCase() === normalizedFallbackBg
      ) {
        delete node.bgcolor;
        changed = true;
      }
    }
    if (changed) {
      canvas.dirty_canvas = true;
      canvas.dirty_bgcanvas = true;
    }
  }

  function setWinnerHighlight(canvas, winnerNode) {
    // Winner tinting is disabled for stability; keep this as a cleanup hook only.
    clearSnapVisual(canvas);
  }

  function rememberRecentSnap(canvas, snap) {
    if (!canvas || !snap) {
      return;
    }
    snap.at = Date.now();
    canvas.__blockSpaceRecentSnap = snap;
  }

  function maybeCommitSnapOnMouseUp(canvas, nodeHint) {
    if (!canvas) {
      return false;
    }
    var snap = canvas.__blockSpaceRecentSnap;
    if (!snap || !snap.at || Date.now() - snap.at > SNAP_MOUSEUP_GRACE_MS) {
      return false;
    }

    var node = nodeHint;
    if (!node || (snap.nodeId != null && node.id !== snap.nodeId)) {
      node = getNodeById(getGraphNodes(canvas), snap.nodeId);
    }
    if (!node || node.constructor === window.LGraphGroup || !node.pos || !node.size) {
      return false;
    }

    var bounds = getNodeBounds(node);
    if (!bounds) {
      return false;
    }
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
      if (
        snap.xDidSnap &&
        typeof snap.xTargetRight === "number" &&
        Math.abs(bounds.right - snap.xTargetRight) <= tolerance
      ) {
        node.size[0] = Math.max(minSize[0], snap.xTargetRight - bounds.left);
        appliedX = true;
      }
      if (
        snap.yDidSnap &&
        typeof snap.yTargetBottom === "number" &&
        Math.abs(bounds.bottom - snap.yTargetBottom) <= tolerance
      ) {
        node.size[1] = Math.max(minSize[1], snap.yTargetBottom - bounds.top);
        appliedY = true;
      }
    }

    if (appliedX || appliedY) {
      triggerSnapFeedback(canvas, node, appliedX, appliedY);
      canvas.dirty_canvas = true;
      canvas.dirty_bgcanvas = true;
      return true;
    }
    return false;
  }

  function normalizeColor(value) {
    return String(value || "").trim().toLowerCase();
  }

  function ensureSnapBadgeLayer() {
    var layer = document.getElementById(SNAP_BADGE_LAYER_ID);
    if (layer) {
      return layer;
    }
    layer = document.createElement("div");
    layer.id = SNAP_BADGE_LAYER_ID;
    layer.style.position = "fixed";
    layer.style.left = "0";
    layer.style.top = "0";
    layer.style.width = "100vw";
    layer.style.height = "100vh";
    layer.style.pointerEvents = "none";
    layer.style.zIndex = "10000";
    document.body.appendChild(layer);
    return layer;
  }

  function removeSnapBadgeLayer() {
    var layer = document.getElementById(SNAP_BADGE_LAYER_ID);
    if (layer && layer.parentNode) {
      layer.parentNode.removeChild(layer);
    }
  }

  function ensureSnapFeedbackState(canvas) {
    if (!canvas) {
      return null;
    }
    if (!canvas.__blockSpaceSnapFeedbackState) {
      canvas.__blockSpaceSnapFeedbackState = {
        pulses: {},
        badges: [],
        badgeLastAtByKey: {},
        badgeSingleton: null,
      };
    }
    return canvas.__blockSpaceSnapFeedbackState;
  }

  function graphToClient(canvas, x, y) {
    if (!canvas || !canvas.canvas) {
      return null;
    }
    var rect = canvas.canvas.getBoundingClientRect();
    var scale = getCanvasScale(canvas);
    var offset = canvas.ds && canvas.ds.offset ? canvas.ds.offset : [0, 0];
    return {
      x: rect.left + (x + (Number(offset[0]) || 0)) * scale,
      y: rect.top + (y + (Number(offset[1]) || 0)) * scale,
    };
  }

  function buildSnapFeedbackPayload(xDidSnap, yDidSnap) {
    if (!xDidSnap && !yDidSnap) {
      return null;
    }
    if (xDidSnap && yDidSnap) {
      return { axisLabel: "XY", color: getFeedbackColorXY() };
    }
    if (xDidSnap) {
      return { axisLabel: "X", color: getFeedbackColorX() };
    }
    return { axisLabel: "Y", color: getFeedbackColorY() };
  }

  function createSnapBadgeElement(axisLabel) {
    var el = document.createElement("div");
    el.textContent = "SNAP " + axisLabel;
    el.style.position = "fixed";
    el.style.padding = "3px 8px";
    el.style.borderRadius = "999px";
    el.style.font = "600 11px/1.2 monospace";
    el.style.letterSpacing = "0.2px";
    el.style.background = getFeedbackBadgeBgColor();
    el.style.color = getFeedbackBadgeTextColor();
    el.style.border = "1px solid rgba(255,255,255,0.22)";
    el.style.boxShadow = "0 4px 12px rgba(0,0,0,0.28)";
    el.style.opacity = "0";
    el.style.transform = "translate3d(0,-4px,0)";
    el.style.transition = "opacity 90ms ease, transform 90ms ease";
    return el;
  }

  function positionSnapBadge(canvas, badge) {
    if (!canvas || !badge || !badge.node || !badge.el) {
      return;
    }
    var cursorX = Number(canvas.__blockSpaceCursorX);
    var cursorY = Number(canvas.__blockSpaceCursorY);
    var client = null;
    if (isFinite(cursorX) && isFinite(cursorY)) {
      client = graphToClient(canvas, cursorX + 10, cursorY - 14);
    }
    if (!client) {
      var bounds = getNodeBounds(badge.node);
      if (!bounds) {
        return;
      }
      client = graphToClient(canvas, bounds.right - 6, bounds.top + 4);
    }
    if (!client) {
      return;
    }
    badge.el.style.left = Math.round(client.x) + "px";
    badge.el.style.top = Math.round(client.y) + "px";
  }

  function triggerSnapFeedback(canvas, node, xDidSnap, yDidSnap) {
    if (!canvas || !node || !getFeedbackEnabled()) {
      return;
    }
    var payload = buildSnapFeedbackPayload(!!xDidSnap, !!yDidSnap);
    if (!payload) {
      return;
    }
    var state = ensureSnapFeedbackState(canvas);
    if (!state) {
      return;
    }
    var now = Date.now();
    var nodeId = node.id != null ? String(node.id) : null;
    if (!nodeId) {
      return;
    }

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

    var badgeKey = nodeId + ":" + payload.axisLabel;
    var cooldownMs = getFeedbackBadgeCooldownMs();
    var lastAt = Number(state.badgeLastAtByKey[badgeKey]) || 0;
    if (now - lastAt >= cooldownMs) {
      state.badgeLastAtByKey[badgeKey] = now;
      var badgeMs = getFeedbackBadgeMs();
      var layer = ensureSnapBadgeLayer();
      var badge = state.badgeSingleton;
      if (!badge || !badge.el || !badge.el.isConnected) {
        var el = createSnapBadgeElement(payload.axisLabel);
        layer.appendChild(el);
        badge = {
          node: node,
          el: el,
          expiresAt: now + badgeMs,
        };
        state.badgeSingleton = badge;
      } else {
        badge.node = node;
        badge.expiresAt = now + badgeMs;
      }
      badge.el.textContent = "SNAP " + payload.axisLabel;
      badge.el.style.background = payload.color;
      badge.el.style.color = getFeedbackBadgeTextColor();
      badge.el.style.opacity = "0";
      badge.el.style.transform = "translate3d(0,-4px,0)";
      positionSnapBadge(canvas, badge);
      requestAnimationFrame(function () {
        if (!badge.el || !badge.el.isConnected) {
          return;
        }
        badge.el.style.opacity = "1";
        badge.el.style.transform = "translate3d(0,0,0)";
      });
    }
    canvas.dirty_canvas = true;
    canvas.dirty_bgcanvas = true;
  }

  function clearSnapFeedbackState(canvas, removeLayer) {
    if (!canvas || !canvas.__blockSpaceSnapFeedbackState) {
      if (removeLayer) {
        removeSnapBadgeLayer();
      }
      return;
    }
    var state = canvas.__blockSpaceSnapFeedbackState;
    var pulses = state.pulses || {};
    var winnerState = canvas.__blockSpaceWinnerHighlight;
    for (var key in pulses) {
      if (!Object.prototype.hasOwnProperty.call(pulses, key)) {
        continue;
      }
      var pulse = pulses[key];
      if (!pulse || !pulse.node) {
        continue;
      }
      if (winnerState && winnerState.node === pulse.node && getHighlightEnabled()) {
        pulse.node.boxcolor = getHighlightColor();
      } else if (pulse.hadBoxcolor) {
        pulse.node.boxcolor = pulse.boxcolor;
      } else {
        delete pulse.node.boxcolor;
      }
    }
    var badges = state.badges || [];
    for (var i = 0; i < badges.length; i += 1) {
      if (badges[i] && badges[i].el && badges[i].el.parentNode) {
        badges[i].el.parentNode.removeChild(badges[i].el);
      }
    }
    if (state.badgeSingleton && state.badgeSingleton.el && state.badgeSingleton.el.parentNode) {
      state.badgeSingleton.el.parentNode.removeChild(state.badgeSingleton.el);
    }
    canvas.__blockSpaceSnapFeedbackState = {
      pulses: {},
      badges: [],
      badgeLastAtByKey: {},
      badgeSingleton: null,
    };
    if (removeLayer) {
      removeSnapBadgeLayer();
    }
    canvas.dirty_canvas = true;
    canvas.dirty_bgcanvas = true;
  }

  function updateSnapFeedback(canvas) {
    if (!canvas) {
      return;
    }
    if (!getFeedbackEnabled()) {
      clearSnapFeedbackState(canvas, true);
      return;
    }
    var state = ensureSnapFeedbackState(canvas);
    if (!state) {
      return;
    }
    var now = Date.now();
    var winnerState = canvas.__blockSpaceWinnerHighlight;

    var pulses = state.pulses || {};
    for (var key in pulses) {
      if (!Object.prototype.hasOwnProperty.call(pulses, key)) {
        continue;
      }
      var pulse = pulses[key];
      if (!pulse || !pulse.node || !getNodeBounds(pulse.node)) {
        delete pulses[key];
        continue;
      }
      if (now <= pulse.expiresAt) {
        pulse.node.boxcolor = pulse.color;
      } else {
        if (winnerState && winnerState.node === pulse.node && getHighlightEnabled()) {
          pulse.node.boxcolor = getHighlightColor();
        } else if (pulse.hadBoxcolor) {
          pulse.node.boxcolor = pulse.boxcolor;
        } else {
          delete pulse.node.boxcolor;
        }
        delete pulses[key];
      }
    }

    var badge = state.badgeSingleton;
    if (badge && badge.el) {
      if (now > badge.expiresAt || !badge.node || !getNodeBounds(badge.node)) {
        if (badge.el.parentNode) {
          badge.el.parentNode.removeChild(badge.el);
        }
        state.badgeSingleton = null;
      } else {
        positionSnapBadge(canvas, badge);
      }
    }

    if (!state.badgeSingleton) {
      removeSnapBadgeLayer();
    }
  }

  function ensureResizeDebugHud() {
    var hud = document.getElementById(DEBUG_HUD_ID);
    if (hud) {
      return hud;
    }
    hud = document.createElement("div");
    hud.id = DEBUG_HUD_ID;
    hud.style.position = "fixed";
    hud.style.top = "200px";
    hud.style.left = "200px";
    hud.style.zIndex = "9999";
    hud.style.padding = "10px 12px";
    hud.style.background = "rgba(10,12,16,0.85)";
    hud.style.border = "1px solid rgba(120,170,255,0.35)";
    hud.style.borderRadius = "8px";
    hud.style.color = "#d6e8ff";
    hud.style.font = "12px/1.4 monospace";
    hud.style.whiteSpace = "pre-line";
    hud.style.pointerEvents = "none";
    hud.textContent = "Resize snap: idle";
    document.body.appendChild(hud);
    return hud;
  }

  function renderResizeDebugHud(canvas) {
    var hud = ensureResizeDebugHud();
    if (!hud) {
      return;
    }
    var cursorX =
      canvas && typeof canvas.__blockSpaceCursorX === "number"
        ? Number(canvas.__blockSpaceCursorX).toFixed(2)
        : "-";
    var s = canvas && canvas.__blockSpaceResizeDebugStatus;
    if (!s || !s.active) {
      hud.textContent = "Resize snap: idle\nCursor X: " + cursorX;
      return;
    }
    var delta = s.xDelta == null ? "-" : Number(s.xDelta).toFixed(2);
    var threshold = s.xThreshold == null ? "-" : Number(s.xThreshold).toFixed(2);
    var xRef = s.xReference == null ? "-" : Number(s.xReference).toFixed(2);
    var xTarget = s.xTarget == null ? "-" : Number(s.xTarget).toFixed(2);
    var yDelta = s.yDelta == null ? "-" : Number(s.yDelta).toFixed(2);
    var yThreshold = s.yThreshold == null ? "-" : Number(s.yThreshold).toFixed(2);
    var yRef = s.yReference == null ? "-" : Number(s.yReference).toFixed(2);
    var yTarget = s.yTarget == null ? "-" : Number(s.yTarget).toFixed(2);
    hud.textContent =
      "Resize snap: active\n" +
      "Cursor X: " + cursorX + "\n" +
      "Node: " + (s.node || "-") + "\n" +
      "Axis: " + (s.axis || "-") + "\n" +
      "X ref: " + xRef + "\n" +
      "X target: " + xTarget + "\n" +
      "X winner: " + (s.xWinner || "none") + "\n" +
      "X mode: " + (s.xMode || "-") + "\n" +
      "X Delta/Threshold: " + delta + " / " + threshold + "\n" +
      "X did snap: " + (s.xDidSnap ? "true" : "false") + "\n" +
      "Y ref: " + yRef + "\n" +
      "Y target: " + yTarget + "\n" +
      "Y winner: " + (s.yWinner || "none") + "\n" +
      "Y intent: " + (s.yIntent || "neutral") + "\n" +
      "Y mode: " + (s.yMode || "-") + "\n" +
      "Y Delta/Threshold: " + yDelta + " / " + yThreshold + "\n" +
      "Y did snap: " + (s.yDidSnap ? "true" : "false") + "\n" +
      "Did snap: " + (s.didSnap ? "true" : "false");
  }

  window.LGraphCanvas.prototype.processMouseMove = function (event) {
    if (!this.__blockSpaceResetPersistedHighlightDone) {
      resetPersistedHighlightArtifacts(this);
      this.__blockSpaceResetPersistedHighlightDone = true;
    }

    var resizingNodeBefore = this.resizing_node || null;
    var result = originalProcessMouseMove.apply(this, arguments);
    if (event && typeof event.canvasX === "number") {
      this.__blockSpaceCursorX = event.canvasX;
    } else if (event && typeof event.clientX === "number") {
      this.__blockSpaceCursorX = event.clientX;
    }
    if (event && typeof event.canvasY === "number") {
      this.__blockSpaceCursorY = event.canvasY;
    } else if (event && typeof event.clientY === "number") {
      this.__blockSpaceCursorY = event.clientY;
    }

    var resizingNode = this.resizing_node || resizingNodeBefore;
    if (
      resizingNode &&
      resizingNode.pos &&
      resizingNode.size &&
      !this.dragging_canvas
    ) {
      var resizeDelta = getResizeDelta(this, resizingNode);
      var resizeAxisLock = resolveResizeAxisLock(this, resizeDelta);
      applyResizeSnapping(this, resizingNode, resizeAxisLock, resizeDelta);
      updateSnapFeedback(this);
      renderResizeDebugHud(this);
      return result;
    }
    this.__blockSpaceResizeDebugStatus = null;
    renderResizeDebugHud(this);
    this.__blockSpacePrevResizeSize = null;
    this.__blockSpaceResizeAxisLock = null;
    this.__blockSpacePrevResizeYSnapTarget = null;
    this.__blockSpaceResizeYSticky = null;
    this.__blockSpaceResizeYIntentState = null;

    var activeNode = getActiveDraggedNode(this, event);
    if (!activeNode || activeNode.constructor === window.LGraphGroup) {
      clearSnapVisual(this);
      updateSnapFeedback(this);
      this.__blockSpacePrevDragPoint = null;
      this.__blockSpaceDragAxisLock = null;
      renderResizeDebugHud(this);
      return result;
    }
    getDragDelta(this, event);

    var activeBounds = getNodeBounds(activeNode);
    if (!activeBounds) {
      updateSnapFeedback(this);
      return result;
    }

    var hSnapMargin = getHSnapMargin();
    var vSnapMargin = getVSnapMargin();
    var xSearchDistance = hSnapMargin * 2;
    var ySearchDistance = vSnapMargin * 2;
    var thresholdCanvas =
      (SNAP_THRESHOLD / Math.max(0.0001, getCanvasScale(this))) * getMoveSnapStrength();

    var nodes = getGraphNodes(this);
    var didSnap = false;
    var xDidSnapMove = false;
    var yDidSnapMove = false;

    var xWinner = chooseWinningTargetForAxis(activeNode, activeBounds, nodes, xSearchDistance, "x", "left", null);
    var xUseTopBottomFallback = false;
    if (!xWinner) {
      xWinner = chooseWinningTargetForAxis(activeNode, activeBounds, nodes, ySearchDistance, "y", "above", null);
      xUseTopBottomFallback = !!xWinner;
      if (!xWinner) {
        xWinner = chooseWinningTargetForAxis(activeNode, activeBounds, nodes, ySearchDistance, "y", "below", null);
        xUseTopBottomFallback = !!xWinner;
      }
      if (!xWinner) {
        xWinner = chooseWinningTargetForAxis(activeNode, activeBounds, nodes, xSearchDistance, "x", "right", null);
      }
    }
    if (xWinner) {
      setWinnerHighlight(this, xWinner.node);
      var xCandidate = computeWinningXCandidate(activeBounds, xWinner, hSnapMargin, xUseTopBottomFallback);
      if (xCandidate.delta <= thresholdCanvas) {
        activeNode.pos[0] = xCandidate.targetX;
        didSnap = true;
        xDidSnapMove = true;
      }
    }

    var yWinner = null;
    var yUseTopFlushFallback = false;
    yWinner = chooseWinningTargetForAxis(activeNode, activeBounds, nodes, ySearchDistance, "y", "above", null);
    if (!yWinner) {
      yWinner = chooseWinningTargetForAxis(activeNode, activeBounds, nodes, xSearchDistance, "x", "left", null);
      if (!yWinner) {
        yWinner = chooseWinningTargetForAxis(activeNode, activeBounds, nodes, xSearchDistance, "x", "right", null);
      }
      yUseTopFlushFallback = !!yWinner;
    }
    if (!yWinner) {
      yWinner = chooseWinningTargetForAxis(activeNode, activeBounds, nodes, ySearchDistance, "y", "below", null);
    }
    if (yWinner) {
      setWinnerHighlight(this, yWinner.node);
      var yCandidate = computeWinningYCandidate(activeBounds, yWinner, vSnapMargin, yUseTopFlushFallback);
      if (yCandidate.delta <= thresholdCanvas) {
        activeNode.pos[1] = yCandidate.targetY;
        didSnap = true;
        yDidSnapMove = true;
      }
    }

    if (!xWinner && !yWinner) {
      clearSnapVisual(this);
    }
    if (didSnap) {
      rememberRecentSnap(this, {
        kind: "move",
        nodeId: activeNode.id,
        threshold: thresholdCanvas,
        xDidSnap: xDidSnapMove,
        yDidSnap: yDidSnapMove,
        xTarget: xDidSnapMove ? activeNode.pos[0] : null,
        yTarget: yDidSnapMove ? activeNode.pos[1] : null,
      });
      triggerSnapFeedback(this, activeNode, xDidSnapMove, yDidSnapMove);
      this.dirty_canvas = true;
      this.dirty_bgcanvas = true;
    }
    updateSnapFeedback(this);
    renderResizeDebugHud(this);

    return result;
  };

  window.LGraphCanvas.prototype.processMouseUp = function (event) {
    var nodeHint =
      this.resizing_node ||
      this.node_dragged ||
      this.current_node ||
      null;
    var result = originalProcessMouseUp.apply(this, arguments);
    maybeCommitSnapOnMouseUp(this, nodeHint);
    clearSnapVisual(this);
    clearSnapFeedbackState(this, true);
    this.__blockSpacePrevDragPoint = null;
    this.__blockSpaceDragAxisLock = null;
    this.__blockSpacePrevResizeSize = null;
    this.__blockSpaceResizeAxisLock = null;
    this.__blockSpacePrevResizeYSnapTarget = null;
    this.__blockSpaceResizeYSticky = null;
    this.__blockSpaceResizeYIntentState = null;
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
})();

(function () {
  "use strict";

  if (typeof window.LGraphCanvas === "undefined" || !window.LGraphCanvas.prototype) {
    return;
  }
  if (window.LGraphCanvas.prototype.__blockSpaceNodeSnapPatched) {
    return;
  }

  var SNAP_THRESHOLD = 10;
  var DEFAULT_SNAP_MARGIN = 20;
  var DEFAULT_HIGHLIGHT_ENABLED = true;
  var DEFAULT_HIGHLIGHT_COLOR = "#57b1ff";
  var WINNER_HIGHLIGHT_BG_FALLBACK = "#3a3f47";

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

  function getSnapMargin() {
    return clampNumber(
      getSettingValue("comfyuiBlockSpace.nodeSnap.marginPx", DEFAULT_SNAP_MARGIN),
      0,
      500,
      DEFAULT_SNAP_MARGIN
    );
  }

  function getHighlightEnabled() {
    return !!getSettingValue("comfyuiBlockSpace.nodeSnap.highlightEnabled", DEFAULT_HIGHLIGHT_ENABLED);
  }

  function getHighlightColor() {
    var value = getSettingValue("comfyuiBlockSpace.nodeSnap.highlightColor", DEFAULT_HIGHLIGHT_COLOR);
    return typeof value === "string" && value.trim() ? value.trim() : DEFAULT_HIGHLIGHT_COLOR;
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

  function isYDominantDrag(delta) {
    if (!delta) {
      return false;
    }
    return Math.abs(delta.dy) > Math.abs(delta.dx);
  }

  function rangesOverlap(aMin, aMax, bMin, bMax, tolerance) {
    var tol = Number(tolerance) || 0;
    return Math.min(aMax, bMax) - Math.max(aMin, bMin) >= -tol;
  }

  function collectValidTargetsForAxis(activeNode, activeBounds, allNodes, maxSearchDistance, axis, direction) {
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
      if (!(emptySpace >= 0 && emptySpace <= maxSearchDistance)) {
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

  function chooseWinningTargetForAxis(activeNode, activeBounds, allNodes, maxSearchDistance, axis, primary, fallback) {
    if (primary == null) {
      primary = axis === "y" ? "above" : "left";
    }
    if (typeof fallback === "undefined") {
      fallback = axis === "y" ? "below" : "right";
    }
    var valid = collectValidTargetsForAxis(activeNode, activeBounds, allNodes, maxSearchDistance, axis, primary);
    if (!valid.length) {
      if (fallback) {
        valid = collectValidTargetsForAxis(activeNode, activeBounds, allNodes, maxSearchDistance, axis, fallback);
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

  function computeWinningXCandidate(activeBounds, winner, snapMargin) {
    var winnerBounds = winner.bounds;
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
    if (!canvas) {
      return;
    }
    var nodes = getGraphNodes(canvas);
    if (!nodes.length) {
      return;
    }
    var normalizedHighlight = String(getHighlightColor() || "").trim().toLowerCase();
    var normalizedFallbackBg = WINNER_HIGHLIGHT_BG_FALLBACK.toLowerCase();
    var changed = false;
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      if (!node || node.constructor === window.LGraphGroup) {
        continue;
      }
      if (
        Object.prototype.hasOwnProperty.call(node, "boxcolor") &&
        String(node.boxcolor || "").trim().toLowerCase() === normalizedHighlight
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

  window.LGraphCanvas.prototype.processMouseMove = function (event) {
    if (!this.__blockSpaceResetPersistedHighlightDone) {
      resetPersistedHighlightArtifacts(this);
      this.__blockSpaceResetPersistedHighlightDone = true;
    }

    var result = originalProcessMouseMove.apply(this, arguments);

    var activeNode = getActiveDraggedNode(this, event);
    if (!activeNode || activeNode.constructor === window.LGraphGroup) {
      clearSnapVisual(this);
      this.__blockSpacePrevDragPoint = null;
      return result;
    }
    var dragDelta = getDragDelta(this, event);

    var activeBounds = getNodeBounds(activeNode);
    if (!activeBounds) {
      return result;
    }

    var snapMargin = getSnapMargin();
    var maxSearchDistance = snapMargin * 2;
    var thresholdCanvas = SNAP_THRESHOLD / Math.max(0.0001, getCanvasScale(this));

    var nodes = getGraphNodes(this);
    var didSnap = false;

    var xWinner = chooseWinningTargetForAxis(activeNode, activeBounds, nodes, maxSearchDistance, "x");
    if (xWinner) {
      setWinnerHighlight(this, xWinner.node);
      var xCandidate = computeWinningXCandidate(activeBounds, xWinner, snapMargin);
      if (xCandidate.delta <= thresholdCanvas) {
        activeNode.pos[0] = xCandidate.targetX;
        didSnap = true;
      }
    }

    var yDominant = isYDominantDrag(dragDelta);
    var yWinner = null;
    var yUseTopFlushFallback = false;
    if (yDominant) {
      yWinner = chooseWinningTargetForAxis(activeNode, activeBounds, nodes, maxSearchDistance, "y", "above", null);
      if (!yWinner) {
        yWinner = chooseWinningTargetForAxis(activeNode, activeBounds, nodes, maxSearchDistance, "x", "left", null);
        if (!yWinner) {
          yWinner = chooseWinningTargetForAxis(activeNode, activeBounds, nodes, maxSearchDistance, "x", "right", null);
        }
        yUseTopFlushFallback = !!yWinner;
      }
    } else {
      yWinner = chooseWinningTargetForAxis(activeNode, activeBounds, nodes, maxSearchDistance, "y");
    }
    if (yWinner) {
      setWinnerHighlight(this, yWinner.node);
      var yCandidate = computeWinningYCandidate(activeBounds, yWinner, snapMargin, yUseTopFlushFallback);
      if (yCandidate.delta <= thresholdCanvas) {
        activeNode.pos[1] = yCandidate.targetY;
        didSnap = true;
      }
    }

    if (!xWinner && !yWinner) {
      clearSnapVisual(this);
    }
    if (didSnap) {
      this.dirty_canvas = true;
      this.dirty_bgcanvas = true;
    }

    return result;
  };

  window.LGraphCanvas.prototype.processMouseUp = function (event) {
    var result = originalProcessMouseUp.apply(this, arguments);
    clearSnapVisual(this);
    this.__blockSpacePrevDragPoint = null;
    return result;
  };

  window.LGraphCanvas.prototype.__blockSpaceNodeSnapPatched = true;

  window.BlockSpaceNodeSnap = window.BlockSpaceNodeSnap || {};
  window.BlockSpaceNodeSnap.resetPersistedHighlightArtifacts = function (canvas) {
    var targetCanvas = canvas || (window.app && window.app.canvas) || null;
    resetPersistedHighlightArtifacts(targetCanvas);
  };
})();

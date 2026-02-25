(function () {
  "use strict";

  if (typeof window.LGraphCanvas === "undefined" || !window.LGraphCanvas.prototype) {
    console.error("[ConnectionFocus] LGraphCanvas is unavailable.");
    return;
  }

  if (window.LGraphCanvas.prototype.__connectionFocusPatched) {
    return;
  }

  var originalProcessMouseDown = window.LGraphCanvas.prototype.processMouseDown;
  var originalProcessMouseUp = window.LGraphCanvas.prototype.processMouseUp;
  var originalRenderLink = window.LGraphCanvas.prototype.renderLink;
  var originalDrawNode = window.LGraphCanvas.prototype.drawNode;

  if (
    typeof originalProcessMouseDown !== "function" ||
    typeof originalProcessMouseUp !== "function" ||
    typeof originalRenderLink !== "function"
  ) {
    console.error("[ConnectionFocus] Required mouse handlers are unavailable.");
    return;
  }

  var focusState = {
    activeCanvas: null,
    activeNodeId: null,
    isHolding: false,
    rafId: 0,
    animationTime: 0,
  };
  var defaultSettings = {
    pulseColor: "#ff00ae",
  };

  function getFocusSettings() {
    if (!window.ConnectionFocusSettings || typeof window.ConnectionFocusSettings !== "object") {
      window.ConnectionFocusSettings = {};
    }
    var settings = window.ConnectionFocusSettings;
    if (typeof settings.pulseColor !== "string" || !settings.pulseColor.trim()) {
      settings.pulseColor = defaultSettings.pulseColor;
    }
    return settings;
  }

  function toPickerHex(colorValue) {
    if (typeof colorValue !== "string") {
      return defaultSettings.pulseColor;
    }
    var value = colorValue.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(value)) {
      return value.toLowerCase();
    }
    if (/^#[0-9a-fA-F]{3}$/.test(value)) {
      return (
        "#" +
        value.charAt(1) +
        value.charAt(1) +
        value.charAt(2) +
        value.charAt(2) +
        value.charAt(3) +
        value.charAt(3)
      ).toLowerCase();
    }
    return defaultSettings.pulseColor;
  }

  function markCanvasDirty(canvas) {
    if (!canvas) {
      return;
    }
    if (typeof canvas.setDirty === "function") {
      canvas.setDirty(true, true);
      return;
    }
    canvas.dirty_canvas = true;
    canvas.dirty_bgcanvas = true;
    if (typeof canvas.draw === "function") {
      canvas.draw(true, true);
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
    if (focusState.rafId) {
      return;
    }
    focusState.rafId = window.requestAnimationFrame(animationTick);
  }

  function clearFocusState() {
    var canvas = focusState.activeCanvas;
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

  window.setConnectionFocusSettings = function (partialSettings) {
    var settings = getFocusSettings();
    if (partialSettings && typeof partialSettings === "object") {
      if (typeof partialSettings.pulseColor === "string" && partialSettings.pulseColor.trim()) {
        settings.pulseColor = partialSettings.pulseColor.trim();
      }
    }
    markCanvasDirty(focusState.activeCanvas);
    return {
      pulseColor: settings.pulseColor,
    };
  };

  function setupDebugColorPicker() {
    var input = document.getElementById("focus-pulse-color");
    if (!input) {
      return;
    }

    var settings = getFocusSettings();
    input.value = toPickerHex(settings.pulseColor);

    input.addEventListener("input", function () {
      window.setConnectionFocusSettings({
        pulseColor: input.value,
      });
    });
  }

  function ensureFocusVersionStamp() {
    var hud = document.querySelector(".hud");
    if (!hud) {
      return;
    }
    if (hud.querySelector(".focus-version-stamp")) {
      return;
    }

    var stamp = document.createElement("div");
    stamp.className = "focus-version-stamp";
    stamp.textContent = "Connection focus: v2";
    stamp.style.marginTop = "6px";
    stamp.style.fontSize = "11px";
    stamp.style.opacity = "0.75";
    hud.appendChild(stamp);
  }

  function isLeftPointer(event) {
    if (!event) {
      return false;
    }
    if (event.button === 0) {
      return true;
    }
    if (typeof event.buttons === "number") {
      return (event.buttons & 1) === 1;
    }
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
    for (var i = 0; i < argsLike.length; i += 1) {
      var candidate = argsLike[i];
      if (candidate && typeof candidate === "object" && "origin_id" in candidate && "target_id" in candidate) {
        return candidate;
      }
    }
    return null;
  }

  function getActiveFocus(canvas) {
    if (!focusState.isHolding || !canvas || focusState.activeCanvas !== canvas || focusState.activeNodeId == null) {
      return null;
    }
    if (!canvas.graph || typeof canvas.graph.getNodeById !== "function") {
      return null;
    }

    var graph = canvas.graph;
    var activeNode = graph.getNodeById(focusState.activeNodeId);
    if (!activeNode) {
      return null;
    }

    var connectedNodeIds = {};
    var connectedLinkIds = {};
    var targetInputsByNode = {};
    var sourceOutputSlotsByNode = {};
    var activeOutputSlots = {};
    var activeInputSlots = {};

    if (graph.links) {
      for (var linkId in graph.links) {
        if (!Object.prototype.hasOwnProperty.call(graph.links, linkId)) {
          continue;
        }
        var link = graph.links[linkId];
        if (!link) {
          continue;
        }
        var linkKey = link.id != null ? link.id : linkId;

        if (link.origin_id === activeNode.id) {
          connectedNodeIds[link.target_id] = true;
          connectedLinkIds[linkKey] = true;
          activeOutputSlots[link.origin_slot] = true;

          if (!targetInputsByNode[link.target_id]) {
            targetInputsByNode[link.target_id] = {};
          }
          targetInputsByNode[link.target_id][link.target_slot] = true;
        }

        if (link.target_id === activeNode.id) {
          connectedNodeIds[link.origin_id] = true;
          connectedLinkIds[linkKey] = true;
          activeInputSlots[link.target_slot] = true;

          if (!sourceOutputSlotsByNode[link.origin_id]) {
            sourceOutputSlotsByNode[link.origin_id] = {};
          }
          sourceOutputSlotsByNode[link.origin_id][link.origin_slot] = true;
        }
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
      animationTime: focusState.animationTime,
    };
  }

  function drawFlowOverlay(canvas, argsLike, animationTime) {
    if (!canvas || !argsLike || !argsLike.length) {
      return;
    }

    var ctx = argsLike[0];
    if (!ctx || typeof ctx.setLineDash !== "function") {
      return;
    }

    var a = argsLike[1];
    var b = argsLike[2];
    if (!a || !b || a.length < 2 || b.length < 2) {
      return;
    }

    var ax = a[0];
    var ay = a[1];
    var bx = b[0];
    var by = b[1];
    var dx = bx - ax;
    var absDx = Math.abs(dx);

    var settings = getFocusSettings();
    var pulseColor = settings.pulseColor;
    var dashOffset = -((animationTime || 0) * 0.028);
    var prevLineWidth = ctx.lineWidth || 1;
    var dist = Math.max(20, Math.min(100, absDx * 0.5));

    ctx.save();
    ctx.globalAlpha = Math.min(1, ctx.globalAlpha * 0.95);
    ctx.lineWidth = Math.max(1.1, prevLineWidth + 0.2);
    ctx.strokeStyle = pulseColor;
    ctx.setLineDash([5, 11]);
    ctx.lineDashOffset = dashOffset;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Draw an explicit spline overlay so configured color is always respected.
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.bezierCurveTo(ax + dist, ay, bx - dist, by, bx, by);
    ctx.stroke();
    ctx.restore();
  }

  function drawSlotRing(node, ctx, isInput, slotIndex, color) {
    if (!node || !ctx || slotIndex < 0) {
      return;
    }
    var pos = node.getConnectionPos(!!isInput, slotIndex, [0, 0]);
    if (!pos || pos.length < 2) {
      return;
    }

    // drawNode executes in node-local coordinates.
    var x = pos[0] - node.pos[0];
    var y = pos[1] - node.pos[1];

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

  window.LGraphCanvas.prototype.renderLink = function (ctx, a, b) {
    var focus = getActiveFocus(this);
    if (!focus) {
      return originalRenderLink.apply(this, arguments);
    }

    var link = extractLinkInfo(arguments);
    if (!link) {
      return originalRenderLink.apply(this, arguments);
    }

    var linkKey = link.id != null ? link.id : null;
    var isConnected = false;
    if (linkKey != null && focus.connectedLinkIds[linkKey]) {
      isConnected = true;
    } else if (focus.connectedLinkIds[String(linkKey)]) {
      isConnected = true;
    }
    if (!isConnected) {
      ctx.save();
      ctx.globalAlpha = ctx.globalAlpha * 0.12;
      var dimResult = originalRenderLink.apply(this, arguments);
      ctx.restore();
      return dimResult;
    }

    var result = originalRenderLink.apply(this, arguments);
    if (link.origin_id === focus.activeNodeId || link.target_id === focus.activeNodeId) {
      drawFlowOverlay(this, arguments, focus.animationTime || 0);
    }
    return result;
  };

  if (typeof originalDrawNode === "function") {
    window.LGraphCanvas.prototype.drawNode = function (node, ctx) {
      var focus = getActiveFocus(this);
      if (!focus || !node) {
        return originalDrawNode.apply(this, arguments);
      }

      var isActiveNode = node.id === focus.activeNodeId;
      var isConnectedNode = isActiveNode || !!focus.connectedNodeIds[node.id];
      var shouldDimNode = !isConnectedNode;

      var result;
      if (shouldDimNode) {
        ctx.save();
        ctx.globalAlpha = ctx.globalAlpha * 0.28;
        result = originalDrawNode.apply(this, arguments);
        ctx.restore();
        return result;
      }

      result = originalDrawNode.apply(this, arguments);

      var pulseColor = getFocusSettings().pulseColor;

      if (isActiveNode) {
        var outputIndices = Object.keys(focus.activeOutputSlots);
        for (var i = 0; i < outputIndices.length; i += 1) {
          drawSlotRing(node, ctx, false, Number(outputIndices[i]), pulseColor);
        }

        var inputIndices = Object.keys(focus.activeInputSlots);
        for (var j = 0; j < inputIndices.length; j += 1) {
          drawSlotRing(node, ctx, true, Number(inputIndices[j]), pulseColor);
        }
      }

      if (focus.targetInputsByNode[node.id]) {
        var targetInputIndices = Object.keys(focus.targetInputsByNode[node.id]);
        for (var k = 0; k < targetInputIndices.length; k += 1) {
          drawSlotRing(node, ctx, true, Number(targetInputIndices[k]), pulseColor);
        }
      }

      if (focus.sourceOutputSlotsByNode[node.id]) {
        var sourceOutputIndices = Object.keys(focus.sourceOutputSlotsByNode[node.id]);
        for (var l = 0; l < sourceOutputIndices.length; l += 1) {
          drawSlotRing(node, ctx, false, Number(sourceOutputIndices[l]), pulseColor);
        }
      }

      return result;
    };
  }

  window.LGraphCanvas.prototype.processMouseDown = function (event) {
    if (isLeftPointer(event)) {
      var node = getNodeAtEvent(this, event);
      if (node && node.id != null) {
        setFocusState(this, node.id);
      } else {
        clearFocusState();
      }
    } else {
      clearFocusState();
    }

    return originalProcessMouseDown.apply(this, arguments);
  };

  window.LGraphCanvas.prototype.processMouseUp = function () {
    var result = originalProcessMouseUp.apply(this, arguments);
    clearFocusState();
    return result;
  };

  window.addEventListener(
    "blur",
    function () {
      clearFocusState();
    },
    true
  );

  document.addEventListener(
    "mouseup",
    function () {
      if (focusState.isHolding) {
        clearFocusState();
      }
    },
    true
  );

  document.addEventListener(
    "keydown",
    function (event) {
      if (event && event.key === "Escape") {
        clearFocusState();
      }
    },
    true
  );

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setupDebugColorPicker();
      ensureFocusVersionStamp();
    });
  } else {
    setupDebugColorPicker();
    ensureFocusVersionStamp();
  }

  window.__connectionFocusState = focusState;
  window.LGraphCanvas.prototype.__connectionFocusPatched = true;
  window.LGraphCanvas.prototype.__connectionFocusOriginalProcessMouseDown = originalProcessMouseDown;
  window.LGraphCanvas.prototype.__connectionFocusOriginalProcessMouseUp = originalProcessMouseUp;
  window.LGraphCanvas.prototype.__connectionFocusOriginalRenderLink = originalRenderLink;
  window.LGraphCanvas.prototype.__connectionFocusOriginalDrawNode = originalDrawNode;
})();

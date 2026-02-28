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
    connectorStubLength: 34,
    connectorStyle: "hybrid",
    enableHybrid: true,
    enableStraight: true,
    enableAngled: true,
  };
  var CONNECTOR_FAN_SPACING = 8;

  function normalizeConnectorStyle(styleValue) {
    if (styleValue === "straight" || styleValue === "hybrid" || styleValue === "angled") {
      return styleValue;
    }
    return defaultSettings.connectorStyle;
  }

  function isComfyUIRuntime() {
    return !!(
      window.BetterNodesSettings &&
      typeof window.BetterNodesSettings.isComfyUIRuntime === "function" &&
      window.BetterNodesSettings.isComfyUIRuntime()
    );
  }

  function getEnabledConnectorStyles(settings) {
    var enabled = [];
    if (settings.enableHybrid) {
      enabled.push("hybrid");
    }
    if (settings.enableStraight) {
      enabled.push("straight");
    }
    if (settings.enableAngled) {
      enabled.push("angled");
    }
    return enabled;
  }

  function resolveAllowedConnectorStyle(styleValue, settings) {
    var preferred = normalizeConnectorStyle(styleValue);
    var enabled = getEnabledConnectorStyles(settings);
    if (enabled.length === 0) {
      return defaultSettings.connectorStyle;
    }
    if (enabled.indexOf(preferred) !== -1) {
      return preferred;
    }
    return enabled[0];
  }

  function getFocusSettings() {
    if (!window.ConnectionFocusSettings || typeof window.ConnectionFocusSettings !== "object") {
      window.ConnectionFocusSettings = {};
    }
    var settings = window.ConnectionFocusSettings;
    if (typeof settings.pulseColor !== "string" || !settings.pulseColor.trim()) {
      settings.pulseColor = defaultSettings.pulseColor;
    }
    if (typeof settings.connectorStubLength !== "number" || !isFinite(settings.connectorStubLength)) {
      settings.connectorStubLength = defaultSettings.connectorStubLength;
    }
    settings.connectorStubLength = Math.max(10, Math.min(80, settings.connectorStubLength));
    settings.enableHybrid = settings.enableHybrid !== false;
    settings.enableStraight = settings.enableStraight !== false;
    settings.enableAngled = settings.enableAngled !== false;
    settings.connectorStyle = resolveAllowedConnectorStyle(settings.connectorStyle, settings);
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

  function getCanvasForSettingsRedraw() {
    if (focusState.activeCanvas) {
      return focusState.activeCanvas;
    }
    if (window.__demoCanvas) {
      return window.__demoCanvas;
    }
    if (window.LGraphCanvas && window.LGraphCanvas.active_canvas) {
      return window.LGraphCanvas.active_canvas;
    }
    return null;
  }

  window.setConnectionFocusSettings = function (partialSettings) {
    var settings = getFocusSettings();
    var styleChanged = false;
    if (partialSettings && typeof partialSettings === "object") {
      if (typeof partialSettings.pulseColor === "string" && partialSettings.pulseColor.trim()) {
        settings.pulseColor = partialSettings.pulseColor.trim();
      }
      if (typeof partialSettings.connectorStubLength === "number" && isFinite(partialSettings.connectorStubLength)) {
        settings.connectorStubLength = Math.max(10, Math.min(80, partialSettings.connectorStubLength));
      }
      if (typeof partialSettings.connectorStyle === "string") {
        var normalizedStyle = normalizeConnectorStyle(partialSettings.connectorStyle);
        styleChanged = normalizedStyle !== settings.connectorStyle;
        settings.connectorStyle = normalizedStyle;
      }
      if (typeof partialSettings.enableHybrid === "boolean") {
        settings.enableHybrid = partialSettings.enableHybrid;
      }
      if (typeof partialSettings.enableStraight === "boolean") {
        settings.enableStraight = partialSettings.enableStraight;
      }
      if (typeof partialSettings.enableAngled === "boolean") {
        settings.enableAngled = partialSettings.enableAngled;
      }
    }
    settings.connectorStyle = resolveAllowedConnectorStyle(settings.connectorStyle, settings);
    // Keep pulse animation alive when changing connector style mid-focus.
    if (styleChanged && focusState.isHolding && focusState.activeCanvas && focusState.activeNodeId != null) {
      focusState.animationTime = window.performance ? window.performance.now() : Date.now();
      stopAnimationLoop();
      startAnimationLoop();
    }
    markCanvasDirty(getCanvasForSettingsRedraw());
    return {
      pulseColor: settings.pulseColor,
      connectorStubLength: settings.connectorStubLength,
      connectorStyle: settings.connectorStyle,
      enableHybrid: settings.enableHybrid,
      enableStraight: settings.enableStraight,
      enableAngled: settings.enableAngled,
    };
  };

  function setupDebugColorPicker() {
    if (isComfyUIRuntime()) {
      return;
    }
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

  function setupDebugConnectorStyleSelector() {
    if (isComfyUIRuntime()) {
      return;
    }
    var select = document.getElementById("focus-connector-style");
    if (!select) {
      return;
    }

    var settings = getFocusSettings();
    select.value = settings.connectorStyle;

    function applyStyleSelection() {
      window.setConnectionFocusSettings({
        connectorStyle: select.value,
      });
    }

    // Some browsers commit <select> changes on blur; listen to both so HUD updates apply immediately.
    select.addEventListener("input", applyStyleSelection);
    select.addEventListener("change", applyStyleSelection);
  }

  function ensureFocusVersionStamp() {
    if (isComfyUIRuntime()) {
      return;
    }
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
    if (event.isPrimary === false) {
      return false;
    }
    if (event.button === 0) {
      return true;
    }
    if (typeof event.which === "number") {
      return event.which === 1;
    }
    if (typeof event.buttons === "number") {
      return (event.buttons & 1) === 1;
    }
    if (typeof event.type === "string" && (event.type === "mousedown" || event.type === "pointerdown")) {
      return true;
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

  function addLinkLaneOffsets(links, byKey) {
    if (!Array.isArray(links) || !links.length || !byKey) {
      return;
    }
    links.sort(function (a, b) {
      var aNode = a.peerNodeId != null ? Number(a.peerNodeId) : 0;
      var bNode = b.peerNodeId != null ? Number(b.peerNodeId) : 0;
      if (aNode !== bNode) {
        return aNode - bNode;
      }
      var aSlot = a.peerSlot != null ? Number(a.peerSlot) : 0;
      var bSlot = b.peerSlot != null ? Number(b.peerSlot) : 0;
      if (aSlot !== bSlot) {
        return aSlot - bSlot;
      }
      return String(a.key).localeCompare(String(b.key));
    });

    var center = (links.length - 1) * 0.5;
    for (var i = 0; i < links.length; i += 1) {
      var laneOffset = (i - center) * CONNECTOR_FAN_SPACING;
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
    var outgoingGroups = {};
    var incomingGroups = {};
    var linkLaneOffsets = {};

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

          var outGroupKey = String(link.origin_slot);
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

          var inGroupKey = String(link.target_slot);
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

    for (var outKey in outgoingGroups) {
      if (Object.prototype.hasOwnProperty.call(outgoingGroups, outKey)) {
        addLinkLaneOffsets(outgoingGroups[outKey], linkLaneOffsets);
      }
    }
    for (var inKey in incomingGroups) {
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
    if (!node) {
      return null;
    }
    // Try to get color from the slot definition
    var slots = isInput ? node.inputs : node.outputs;
    if (slots && slots[slotIndex]) {
      var slot = slots[slotIndex];
      
      // Return explicit color if defined on slot
      if (typeof slot.color === "string" && slot.color) {
        return slot.color;
      }
      
      // Get color from slot type
      if (slot.type && typeof slot.type === "string") {
        var slotType = slot.type;
        
        // Check LiteGraph type_colors first (ComfyUI defines these)
        var lg = window.LiteGraph;
        if (lg && lg.type_colors && lg.type_colors[slotType]) {
          return lg.type_colors[slotType];
        }
        
        // Check LiteGraph constants like EVENT_COLOR, ACTION_COLOR, etc.
        var constName = slotType.toUpperCase() + "_COLOR";
        if (lg && lg[constName]) {
          return lg[constName];
        }
        
        // ComfyUI type color mappings (based on observed colors)
        var typeMap = {
          "MODEL": "#B39DDB",      // Light purple
          "CLIP": "#FFD166",       // Yellow/gold
          "VAE": "#FF6B6B",        // Red/coral
          "LATENT": "#FF6B9D",     // Pink
          "IMAGE": "#4ECDC4",      // Teal
          "MASK": "#95E1D3",       // Light teal
          "CONDITIONING": "#FFA07A", // Light salmon/orange
          "FLOAT": "#AAEE88",      // Light green
          "INT": "#AAEE88",        // Light green
          "STRING": "#F7DC6F",     // Yellow
          "BOOLEAN": "#87CEEB",    // Sky blue
        };
        if (typeMap[slotType]) {
          return typeMap[slotType];
        }
      }
    }
    return null;
  }

  function drawFlowOverlay(canvas, argsLike, animationTime, sourceOffset, targetOffset, color) {
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
    var settings = getFocusSettings();
    // Use provided color or fall back to pulseColor
    var flowColor = color || settings.pulseColor;
    var dashOffset = -((animationTime || 0) * 0.028);
    var prevLineWidth = ctx.lineWidth || 1;
    var stub = settings.connectorStubLength;

    ctx.save();
    ctx.globalAlpha = Math.min(1, ctx.globalAlpha * 0.95);
    ctx.lineWidth = Math.max(1.1, prevLineWidth + 0.2);
    ctx.strokeStyle = flowColor;
    ctx.setLineDash([5, 11]);
    ctx.lineDashOffset = dashOffset;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    drawConfiguredPath(
      ctx,
      ax,
      ay,
      bx,
      by,
      stub,
      settings.connectorStyle,
      sourceOffset || 0,
      targetOffset || 0
    );
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

  function drawHardAngleLink(argsLike, sourceOffset, targetOffset) {
    if (!argsLike || !argsLike.length) {
      return;
    }
    var ctx = argsLike[0];
    if (!ctx) {
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
    var settings = getFocusSettings();
    var stub = settings.connectorStubLength;

    ctx.save();
    ctx.lineJoin = "miter";
    ctx.lineCap = "round";
    drawConfiguredPath(
      ctx,
      ax,
      ay,
      bx,
      by,
      stub,
      settings.connectorStyle,
      sourceOffset || 0,
      targetOffset || 0
    );
    ctx.stroke();
    ctx.restore();
  }

  function drawConfiguredPath(ctx, ax, ay, bx, by, stub, style, sourceOffset, targetOffset) {
    var so = Number(sourceOffset) || 0;
    var to = Number(targetOffset) || 0;
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
    // Keep endpoint stubs fixed relative to sockets for predictable tracing.
    var sourceY = ay + (Number(sourceOffset) || 0);
    var targetY = by + (Number(targetOffset) || 0);
    var startX = ax + stub;
    var endX = bx - stub;
    var needsDetour = endX <= startX + 8;
    var laneX = Math.max(startX, endX) + stub;
    var midX = (startX + endX) * 0.5;

    ctx.beginPath();
    ctx.moveTo(ax, ay);
    if (sourceY !== ay) {
      ctx.lineTo(ax, sourceY);
    }
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
    if (targetY !== by) {
      ctx.lineTo(bx, by);
    }
  }

  function drawAngledPath(ctx, ax, ay, bx, by, stub, sourceOffset, targetOffset) {
    // Fixed-length endpoint stubs with a single angled center segment.
    var sourceY = ay + (Number(sourceOffset) || 0);
    var targetY = by + (Number(targetOffset) || 0);
    var startX = ax + stub;
    var endX = bx - stub;
    var needsDetour = endX <= startX + 8;
    var laneX = Math.max(startX, endX) + stub;

    ctx.beginPath();
    ctx.moveTo(ax, ay);
    if (sourceY !== ay) {
      ctx.lineTo(ax, sourceY);
    }
    ctx.lineTo(startX, sourceY);
    if (needsDetour) {
      ctx.lineTo(laneX, sourceY);
      ctx.lineTo(laneX, targetY);
      ctx.lineTo(endX, targetY);
    } else {
      ctx.lineTo(endX, targetY);
    }
    ctx.lineTo(bx, targetY);
    if (targetY !== by) {
      ctx.lineTo(bx, by);
    }
  }

  function drawHybridPath(ctx, ax, ay, bx, by, stub) {
    // Keep endpoint stubs fixed relative to sockets for predictable tracing.
    var startX = ax + stub;
    var endX = bx - stub;
    var needsDetour = endX <= startX + 8;
    var laneX = Math.max(startX, endX) + stub;
    var dx = Math.max(20, Math.min(140, Math.abs(endX - startX) * 0.5));

    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(startX, ay);
    if (needsDetour) {
      // Keep crossed links visible by curving through a fixed outer lane.
      ctx.bezierCurveTo(laneX, ay, laneX, by, endX, by);
    } else {
      // Hybrid shape: straight stubs with a LiteGraph-like curved middle segment.
      ctx.bezierCurveTo(startX + dx, ay, endX - dx, by, endX, by);
    }
    ctx.lineTo(bx, by);
  }

  window.LGraphCanvas.prototype.renderLink = function (ctx, a, b) {
    // If custom connectors are disabled, use original LiteGraph rendering
    if (!getFocusSettings().enableAngled) {
      return originalRenderLink.apply(this, arguments);
    }

    var focus = getActiveFocus(this);
    if (!focus) {
      return drawHardAngleLink(arguments);
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
      var dimResult = drawHardAngleLink(arguments);
      ctx.restore();
      return dimResult;
    }

    var sourceOffset = 0;
    var targetOffset = 0;
    var style = getFocusSettings().connectorStyle;
    if (style === "straight" || style === "angled") {
      var laneMap = focus.linkLaneOffsets || {};
      var laneKey = linkKey != null ? String(linkKey) : "";
      var laneOffset = Number(laneMap[laneKey]) || 0;
      if (link.origin_id === focus.activeNodeId) {
        sourceOffset = laneOffset;
      } else if (link.target_id === focus.activeNodeId) {
        targetOffset = laneOffset;
      }
    }

    var result = drawHardAngleLink(arguments, sourceOffset, targetOffset);
    if (link.origin_id === focus.activeNodeId || link.target_id === focus.activeNodeId) {
      // Get the slot color from the origin node (output slot)
      var originNode = this.graph.getNodeById(link.origin_id);
      var slotColor = getSlotColor(originNode, false, link.origin_slot);
      drawFlowOverlay(this, arguments, focus.animationTime || 0, sourceOffset, targetOffset, slotColor);
    }
    return result;
  };

  if (typeof originalDrawNode === "function") {
    window.LGraphCanvas.prototype.drawNode = function (node, ctx) {
      // If custom connectors are disabled, use original LiteGraph rendering
      if (!getFocusSettings().enableAngled) {
        return originalDrawNode.apply(this, arguments);
      }

      var focus = getActiveFocus(this);
      if (!focus || !node) {
        return originalDrawNode.apply(this, arguments);
      }

      var isActiveNode = node.id === focus.activeNodeId;
      var isConnectedNode = isActiveNode || !!focus.connectedNodeIds[node.id];
      var shouldDimNode = !isConnectedNode;

      var result;
      if (shouldDimNode) {
        var previousEditorAlpha = this.editor_alpha;
        var safeEditorAlpha = typeof previousEditorAlpha === "number" ? previousEditorAlpha : 1;
        // Use node-level alpha so the node body is actually transparent, not just darkened.
        this.editor_alpha = safeEditorAlpha * 0.28;
        try {
          result = originalDrawNode.apply(this, arguments);
        } finally {
          this.editor_alpha = previousEditorAlpha;
        }
        return result;
      }

      result = originalDrawNode.apply(this, arguments);

      if (isActiveNode) {
        var outputIndices = Object.keys(focus.activeOutputSlots);
        for (var i = 0; i < outputIndices.length; i += 1) {
          var outColor = getSlotColor(node, false, Number(outputIndices[i])) || getFocusSettings().pulseColor;
          drawSlotRing(node, ctx, false, Number(outputIndices[i]), outColor);
        }

        var inputIndices = Object.keys(focus.activeInputSlots);
        for (var j = 0; j < inputIndices.length; j += 1) {
          var inColor = getSlotColor(node, true, Number(inputIndices[j])) || getFocusSettings().pulseColor;
          drawSlotRing(node, ctx, true, Number(inputIndices[j]), inColor);
        }
      }

      if (focus.targetInputsByNode[node.id]) {
        var targetInputIndices = Object.keys(focus.targetInputsByNode[node.id]);
        for (var k = 0; k < targetInputIndices.length; k += 1) {
          var targetColor = getSlotColor(node, true, Number(targetInputIndices[k])) || getFocusSettings().pulseColor;
          drawSlotRing(node, ctx, true, Number(targetInputIndices[k]), targetColor);
        }
      }

      if (focus.sourceOutputSlotsByNode[node.id]) {
        var sourceOutputIndices = Object.keys(focus.sourceOutputSlotsByNode[node.id]);
        for (var l = 0; l < sourceOutputIndices.length; l += 1) {
          var sourceColor = getSlotColor(node, false, Number(sourceOutputIndices[l])) || getFocusSettings().pulseColor;
          drawSlotRing(node, ctx, false, Number(sourceOutputIndices[l]), sourceColor);
        }
      }

      return result;
    };
  }

  window.LGraphCanvas.prototype.processMouseDown = function (event) {
    var isLeft = isLeftPointer(event);
    var nodeBefore = isLeft ? getNodeAtEvent(this, event) : null;
    var result = originalProcessMouseDown.apply(this, arguments);

    // Only set focus state if custom connectors are enabled
    if (!getFocusSettings().enableAngled) {
      return result;
    }

    if (!isLeft) {
      clearFocusState();
      return result;
    }

    var node = nodeBefore || getNodeAtEvent(this, event) || this.node_over || null;
    if (!node && this.selected_nodes) {
      for (var nodeId in this.selected_nodes) {
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
      setupDebugConnectorStyleSelector();
      ensureFocusVersionStamp();
    });
  } else {
    setupDebugColorPicker();
    setupDebugConnectorStyleSelector();
    ensureFocusVersionStamp();
  }

  window.__connectionFocusState = focusState;
  window.LGraphCanvas.prototype.__connectionFocusPatched = true;
  window.LGraphCanvas.prototype.__connectionFocusOriginalProcessMouseDown = originalProcessMouseDown;
  window.LGraphCanvas.prototype.__connectionFocusOriginalProcessMouseUp = originalProcessMouseUp;
  window.LGraphCanvas.prototype.__connectionFocusOriginalRenderLink = originalRenderLink;
  window.LGraphCanvas.prototype.__connectionFocusOriginalDrawNode = originalDrawNode;
})();

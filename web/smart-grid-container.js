(function () {
  "use strict";

  if (
    typeof window.LiteGraph === "undefined" ||
    typeof window.LGraphGroup === "undefined" ||
    typeof window.LGraphCanvas === "undefined"
  ) {
    console.error("[SmartGrid] LiteGraph is unavailable.");
    return;
  }

  if (window.LGraphCanvas.prototype.__smartGridPatched) {
    return;
  }

  var SNAP_INCREMENT = 5;
  var SPLITTER_HITBOX = 10;
  var HEADER_HEIGHT = 32;
  var MIN_ROW_HEIGHT = 70;
  var GRID_SETTINGS_STORAGE_KEY = "smart_grid_layout_settings_v1";
  var DEFAULT_GRID_SETTINGS = {
    rowPadding: 28,
    rowTopPadding: 52,
    rowBottomPadding: 46,
    nodeVerticalGap: 40,
    borderJunctionGap: 6,
    gridLineWidth: 2,
    gridLineColor: "#ffffff",
    gridLineStyle: "solid",
    gridLineAlpha: 0.32,
    alignmentHintEnabled: true,
    alignmentSnapEnabled: true,
    alignmentThresholdPx: 12,
    edgeToEdgeSnapGapPx: 20,
  };
  var gridSettings = {
    rowPadding: DEFAULT_GRID_SETTINGS.rowPadding,
    rowTopPadding: DEFAULT_GRID_SETTINGS.rowTopPadding,
    rowBottomPadding: DEFAULT_GRID_SETTINGS.rowBottomPadding,
    nodeVerticalGap: DEFAULT_GRID_SETTINGS.nodeVerticalGap,
    borderJunctionGap: DEFAULT_GRID_SETTINGS.borderJunctionGap,
    gridLineWidth: DEFAULT_GRID_SETTINGS.gridLineWidth,
    gridLineColor: DEFAULT_GRID_SETTINGS.gridLineColor,
    gridLineStyle: DEFAULT_GRID_SETTINGS.gridLineStyle,
    gridLineAlpha: DEFAULT_GRID_SETTINGS.gridLineAlpha,
    alignmentHintEnabled: DEFAULT_GRID_SETTINGS.alignmentHintEnabled,
    alignmentSnapEnabled: DEFAULT_GRID_SETTINGS.alignmentSnapEnabled,
    alignmentThresholdPx: DEFAULT_GRID_SETTINGS.alignmentThresholdPx,
    edgeToEdgeSnapGapPx: DEFAULT_GRID_SETTINGS.edgeToEdgeSnapGapPx,
  };
  var ROW_PADDING = gridSettings.rowPadding;
  var INNER_NODE_PADDING = ROW_PADDING;
  var ROW_NODE_TOP_PADDING = gridSettings.rowTopPadding;
  var ROW_NODE_BOTTOM_PADDING = gridSettings.rowBottomPadding;
  var NODE_VERTICAL_GAP = gridSettings.nodeVerticalGap;
  var BORDER_JUNCTION_GAP = gridSettings.borderJunctionGap;
  var GRID_LINE_WIDTH = gridSettings.gridLineWidth;
  var GRID_LINE_COLOR = gridSettings.gridLineColor;
  var GRID_LINE_STYLE = gridSettings.gridLineStyle;
  var GRID_LINE_ALPHA = gridSettings.gridLineAlpha;
  var ALIGNMENT_HINT_ENABLED = gridSettings.alignmentHintEnabled;
  var ALIGNMENT_SNAP_ENABLED = gridSettings.alignmentSnapEnabled;
  var ALIGNMENT_THRESHOLD_PX = gridSettings.alignmentThresholdPx;
  var EDGE_TO_EDGE_SNAP_GAP_PX = gridSettings.edgeToEdgeSnapGapPx;
  var ALIGNMENT_GUIDE_COLOR = "rgba(80,180,255,0.85)";
  var ALIGNMENT_GUIDE_WIDTH = 2;
  var AUTOFIT_BUTTON_WIDTH = 64;
  var AUTOFIT_BUTTON_HEIGHT = 18;
  var AUTOFIT_BUTTON_MARGIN = 8;
  var COLLAPSE_BUTTON_WIDTH = 72;
  var COLLAPSE_BUTTON_HEIGHT = 18;
  var COLLAPSED_GROUP_HEIGHT = HEADER_HEIGHT + 30;
  var COLLAPSED_ANCHOR_GAP = 14;
  var COLLAPSED_HEADER_SIDE_PADDING = 12;
  var COLLAPSED_TITLE_BUTTON_GAP = 10;
  var COLLAPSED_PROXY_LABEL_PADDING = 10;
  var COLLAPSED_PROXY_LABEL_CENTER_GAP = 24;
  var COLLAPSED_MIN_WIDTH = 180;
  var COLLAPSED_TITLE_FONT = "bold 16px Arial";
  var MAX_COLLAPSED_TITLE_WIDTH = 280;

  var originalOnGroupAdd = window.LGraphCanvas.onGroupAdd;
  var originalGetCanvasMenuOptions = window.LGraphCanvas.prototype.getCanvasMenuOptions;
  var originalGroupSerialize = window.LGraphGroup.prototype.serialize;
  var originalGroupConfigure = window.LGraphGroup.prototype.configure;
  var originalGroupRecomputeInsideNodes = window.LGraphGroup.prototype.recomputeInsideNodes;
  var originalDrawGroups = window.LGraphCanvas.prototype.drawGroups;
  var originalRenderLink = window.LGraphCanvas.prototype.renderLink;
  var originalDrawNode = window.LGraphCanvas.prototype.drawNode;
  var originalGetGroupMenuOptions = window.LGraphCanvas.prototype.getGroupMenuOptions;
  var originalProcessContextMenu = window.LGraphCanvas.prototype.processContextMenu;
  var originalProcessMouseDown = window.LGraphCanvas.prototype.processMouseDown;
  var originalProcessMouseMove = window.LGraphCanvas.prototype.processMouseMove;
  var originalProcessMouseUp = window.LGraphCanvas.prototype.processMouseUp;
  var originalGraphGetNodeOnPos = window.LGraph && window.LGraph.prototype
    ? window.LGraph.prototype.getNodeOnPos
    : null;
  var originalGraphRemove = window.LGraph && window.LGraph.prototype
    ? window.LGraph.prototype.remove
    : null;
  var originalNodeSetSize = window.LGraphNode && window.LGraphNode.prototype
    ? window.LGraphNode.prototype.setSize
    : null;

  function resolveCanvasPos(canvas, mouse_event) {
    if (mouse_event && typeof mouse_event.canvasX === "number" && typeof mouse_event.canvasY === "number") {
      return [mouse_event.canvasX, mouse_event.canvasY];
    }
    if (canvas && typeof canvas.convertEventToCanvasOffset === "function" && mouse_event) {
      return canvas.convertEventToCanvasOffset(mouse_event);
    }
    if (canvas && Array.isArray(canvas.graph_mouse) && canvas.graph_mouse.length >= 2) {
      return [canvas.graph_mouse[0], canvas.graph_mouse[1]];
    }
    return [80, 80];
  }

  function createSmartGridGroupAtPos(graph, pos) {
    if (!graph) {
      return null;
    }
    var group = new window.LiteGraph.LGraphGroup();
    group.pos = [
      pos && pos.length > 0 ? Number(pos[0]) || 80 : 80,
      pos && pos.length > 1 ? Number(pos[1]) || 80 : 80,
    ];
    graph.add(group);
    ensureGroupState(group);
    updateLayout(group, false);
    if (typeof group.setDirtyCanvas === "function") {
      group.setDirtyCanvas(true, true);
    }
    return group;
  }

  function createSmartGridGroupAtEvent(canvas, mouse_event) {
    if (!canvas || !canvas.graph) {
      return null;
    }
    return createSmartGridGroupAtPos(canvas.graph, resolveCanvasPos(canvas, mouse_event));
  }


  function nextId(prefix) {
    return prefix + "_" + Math.floor(Math.random() * 1000000000);
  }

  function toNumber(value, fallback) {
    var parsed = Number(value);
    return isFinite(parsed) ? parsed : fallback;
  }

  function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizeGridLineStyle(style, fallback) {
    if (style === "solid" || style === "dashed" || style === "dotted" || style === "double") {
      return style;
    }
    return fallback;
  }

  function normalizeHexColor(value, fallback) {
    if (typeof value !== "string") {
      return fallback;
    }
    var trimmed = value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
      return trimmed.toLowerCase();
    }
    if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
      return (
        "#" +
        trimmed.charAt(1) +
        trimmed.charAt(1) +
        trimmed.charAt(2) +
        trimmed.charAt(2) +
        trimmed.charAt(3) +
        trimmed.charAt(3)
      ).toLowerCase();
    }
    return fallback;
  }

  function parseHexColor(hex) {
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16),
    };
  }

  function buildRgba(hex, alpha) {
    var rgb = parseHexColor(normalizeHexColor(hex, "#ffffff"));
    return "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + "," + alpha + ")";
  }

  function isComfyUIRuntime() {
    return !!(
      window.BetterNodesSettings &&
      typeof window.BetterNodesSettings.isComfyUIRuntime === "function" &&
      window.BetterNodesSettings.isComfyUIRuntime()
    );
  }

  function applyGridSettings(partial, skipPersist) {
    if (!partial) {
      return;
    }

    gridSettings.rowPadding = clampNumber(
      toNumber(partial.rowPadding, gridSettings.rowPadding),
      8,
      120
    );
    gridSettings.rowTopPadding = clampNumber(
      toNumber(partial.rowTopPadding, gridSettings.rowTopPadding),
      16,
      200
    );
    gridSettings.rowBottomPadding = clampNumber(
      toNumber(partial.rowBottomPadding, gridSettings.rowBottomPadding),
      12,
      200
    );
    gridSettings.nodeVerticalGap = clampNumber(
      toNumber(partial.nodeVerticalGap, gridSettings.nodeVerticalGap),
      8,
      140
    );
    gridSettings.borderJunctionGap = clampNumber(
      toNumber(partial.borderJunctionGap, gridSettings.borderJunctionGap),
      0,
      30
    );
    gridSettings.gridLineWidth = clampNumber(
      toNumber(partial.gridLineWidth, gridSettings.gridLineWidth),
      1,
      5
    );
    gridSettings.gridLineColor = normalizeHexColor(
      partial.gridLineColor,
      gridSettings.gridLineColor
    );
    gridSettings.gridLineStyle = normalizeGridLineStyle(
      partial.gridLineStyle,
      gridSettings.gridLineStyle
    );
    gridSettings.gridLineAlpha = clampNumber(
      toNumber(partial.gridLineAlpha, gridSettings.gridLineAlpha),
      0.1,
      0.9
    );
    if (partial.alignmentHintEnabled != null) {
      gridSettings.alignmentHintEnabled = !!partial.alignmentHintEnabled;
    }
    if (partial.alignmentSnapEnabled != null) {
      gridSettings.alignmentSnapEnabled = !!partial.alignmentSnapEnabled;
    }
    gridSettings.alignmentThresholdPx = clampNumber(
      toNumber(partial.alignmentThresholdPx, gridSettings.alignmentThresholdPx),
      4,
      40
    );
    gridSettings.edgeToEdgeSnapGapPx = clampNumber(
      toNumber(partial.edgeToEdgeSnapGapPx, gridSettings.edgeToEdgeSnapGapPx),
      0,
      64
    );

    ROW_PADDING = gridSettings.rowPadding;
    INNER_NODE_PADDING = ROW_PADDING;
    // Keep top/bottom row padding directly user-configurable from HUD controls.
    ROW_NODE_TOP_PADDING = gridSettings.rowTopPadding;
    ROW_NODE_BOTTOM_PADDING = gridSettings.rowBottomPadding;
    NODE_VERTICAL_GAP = gridSettings.nodeVerticalGap;
    BORDER_JUNCTION_GAP = gridSettings.borderJunctionGap;
    GRID_LINE_WIDTH = gridSettings.gridLineWidth;
    GRID_LINE_COLOR = gridSettings.gridLineColor;
    GRID_LINE_STYLE = gridSettings.gridLineStyle;
    GRID_LINE_ALPHA = gridSettings.gridLineAlpha;
    ALIGNMENT_HINT_ENABLED = !!gridSettings.alignmentHintEnabled;
    ALIGNMENT_SNAP_ENABLED = !!gridSettings.alignmentSnapEnabled;
    ALIGNMENT_THRESHOLD_PX = gridSettings.alignmentThresholdPx;
    EDGE_TO_EDGE_SNAP_GAP_PX = gridSettings.edgeToEdgeSnapGapPx;
    if (window.SmartGrid) {
      window.SmartGrid.ROW_PADDING = ROW_PADDING;
    }

    if (!skipPersist) {
      try {
        localStorage.setItem(GRID_SETTINGS_STORAGE_KEY, JSON.stringify(gridSettings));
      } catch (error) {
        // Ignore storage failures.
      }
    }
  }

  function loadGridSettings() {
    try {
      var raw = localStorage.getItem(GRID_SETTINGS_STORAGE_KEY);
      if (!raw) {
        applyGridSettings(DEFAULT_GRID_SETTINGS, true);
        return;
      }
      var parsed = JSON.parse(raw);
      applyGridSettings(parsed || DEFAULT_GRID_SETTINGS, true);
    } catch (error) {
      applyGridSettings(DEFAULT_GRID_SETTINGS, true);
    }
  }

  function normalizeColumns(widths) {
    var out = [];
    var total = 0;
    for (var i = 0; i < widths.length; i += 1) {
      var value = Number(widths[i]) || 0;
      if (value < 0) {
        value = 0;
      }
      out.push(value);
      total += value;
    }
    if (!total) {
      var equal = 100 / Math.max(1, out.length || 1);
      out = [];
      for (var j = 0; j < Math.max(1, widths.length); j += 1) {
        out.push(equal);
      }
      return out;
    }
    for (var k = 0; k < out.length; k += 1) {
      out[k] = (out[k] / total) * 100;
    }
    var sum = 0;
    for (var p = 0; p < out.length; p += 1) {
      sum += out[p];
    }
    out[out.length - 1] += 100 - sum;
    return out;
  }

  function createRowFromPreset(widths) {
    var columns = [];
    var normalized = normalizeColumns(widths && widths.length ? widths : [100]);
    for (var i = 0; i < normalized.length; i += 1) {
      columns.push({
        id: nextId("col"),
        flexPct: normalized[i],
        // Legacy field retained for backward compatibility with older saves.
        widthPct: normalized[i],
        childNodeIds: [],
      });
    }
    return {
      id: nextId("row"),
      heightPx: MIN_ROW_HEIGHT,
      columns: columns,
    };
  }

  function ensureGroupState(group) {
    if (!group) {
      return null;
    }
    if (!group.__smartGridState || !Array.isArray(group.__smartGridState.rows)) {
      group.__smartGridState = {
        rows: [createRowFromPreset([50, 50])],
        collapsed: false,
        expandedSize: null,
      };
    }
    if (typeof group.__smartGridState.collapsed !== "boolean") {
      group.__smartGridState.collapsed = false;
    }
    if (
      !group.__smartGridState.expandedSize ||
      !Array.isArray(group.__smartGridState.expandedSize) ||
      group.__smartGridState.expandedSize.length < 2
    ) {
      group.__smartGridState.expandedSize = null;
    }
    if (!group.__isSmartGrid) {
      group.__isSmartGrid = true;
    }
    syncSmartGridGroupChildren(group);
    return group.__smartGridState;
  }

  function getManagedNodeRefs(group) {
    if (!group || !group.graph || !group.__isSmartGrid) {
      return [];
    }
    var state = group.__smartGridState;
    if (!state || !Array.isArray(state.rows)) {
      return [];
    }
    var nodeRefs = [];
    var seen = {};
    for (var r = 0; r < state.rows.length; r += 1) {
      var row = state.rows[r];
      var cols = row && Array.isArray(row.columns) ? row.columns : [];
      for (var c = 0; c < cols.length; c += 1) {
        var ids = Array.isArray(cols[c].childNodeIds) ? cols[c].childNodeIds : [];
        for (var i = 0; i < ids.length; i += 1) {
          var nodeId = ids[i];
          if (nodeId == null || seen[nodeId]) {
            continue;
          }
          var node = getNodeById(group.graph, nodeId);
          if (!node) {
            continue;
          }
          seen[nodeId] = true;
          nodeRefs.push(node);
        }
      }
    }
    return nodeRefs;
  }

  function syncSmartGridGroupChildren(group) {
    if (!group || !group.__isSmartGrid) {
      return;
    }
    group._nodes = getManagedNodeRefs(group);
  }

  function isGroupCollapsed(group) {
    var state = ensureGroupState(group);
    return !!(state && state.collapsed);
  }

  function isNodeManagedByCollapsedGroup(graph, nodeId) {
    var group = findManagingGroupForNode(graph, nodeId);
    return !!(group && isGroupCollapsed(group));
  }

  function getSmartGroups(graph) {
    if (!graph || !Array.isArray(graph._groups)) {
      return [];
    }
    var result = [];
    for (var i = 0; i < graph._groups.length; i += 1) {
      var group = graph._groups[i];
      if (group && group.__isSmartGrid) {
        result.push(group);
      }
    }
    return result;
  }

  function getNodeById(graph, id) {
    if (!graph || id == null || typeof graph.getNodeById !== "function") {
      return null;
    }
    return graph.getNodeById(id);
  }

  function getNodeIntrinsicMinSize(node) {
    var fallback = [
      node && node.size && node.size.length >= 1 ? Number(node.size[0]) || 0 : 0,
      node && node.size && node.size.length >= 2 ? Number(node.size[1]) || 0 : 0,
    ];
    if (!node || typeof node.computeSize !== "function") {
      return fallback;
    }

    var previousManaged = node.__smartGridManaged;
    node.__smartGridManaged = true;
    try {
      var size = node.computeSize();
      if (size && size.length >= 2) {
        return [Number(size[0]) || 0, Number(size[1]) || 0];
      }
    } catch (error) {
      // Ignore compute errors and fall back to current node size.
    } finally {
      node.__smartGridManaged = previousManaged;
    }
    return fallback;
  }

  function getGroupBounds(group) {
    if (!group || !group.pos || !group.size) {
      return null;
    }
    var left = Number(group.pos[0]) || 0;
    var top = Number(group.pos[1]) || 0;
    var width = Math.max(0, Number(group.size[0]) || 0);
    var height = Math.max(0, Number(group.size[1]) || 0);
    return {
      left: left,
      right: left + width,
      top: top,
      bottom: top + height,
    };
  }

  function moveGroupWithChildren(group, dx, dy) {
    if (!group || (!dx && !dy)) {
      return;
    }
    group.pos[0] += dx;
    group.pos[1] += dy;
    var nodes = Array.isArray(group._nodes) ? group._nodes : [];
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      if (!node || !node.pos) {
        continue;
      }
      node.pos[0] += dx;
      node.pos[1] += dy;
    }
  }

  function clearAlignmentState(canvas) {
    if (!canvas) {
      return;
    }
    canvas.__smartGridAlignmentState = null;
    canvas.__smartGridAlignmentMode = null;
  }

  function computeAlignmentState(canvas, draggingGroup) {
    if (!canvas || !canvas.graph || !draggingGroup) {
      return null;
    }
    var sourceBounds = getGroupBounds(draggingGroup);
    if (!sourceBounds) {
      return null;
    }
    var groups = getSmartGroups(canvas.graph);
    if (!groups.length) {
      return null;
    }
    var scale = (canvas.ds && Number(canvas.ds.scale)) ? Number(canvas.ds.scale) : 1;
    var thresholdCanvas = ALIGNMENT_THRESHOLD_PX / Math.max(0.0001, scale);
    var bestV = null;
    var bestVCross = null;
    var bestH = null;
    var bestHCross = null;

    for (var i = 0; i < groups.length; i += 1) {
      var target = groups[i];
      if (!target || target === draggingGroup) {
        continue;
      }
      var targetBounds = getGroupBounds(target);
      if (!targetBounds) {
        continue;
      }

      var dLeft = targetBounds.left - sourceBounds.left;
      var dRight = targetBounds.right - sourceBounds.right;
      var dTop = targetBounds.top - sourceBounds.top;
      var dBottom = targetBounds.bottom - sourceBounds.bottom;

      if (Math.abs(dLeft) <= thresholdCanvas && (!bestV || Math.abs(dLeft) < Math.abs(bestV.delta))) {
        bestV = {
          delta: dLeft,
          x: targetBounds.left,
          y1: Math.min(sourceBounds.top, targetBounds.top),
          y2: Math.max(sourceBounds.bottom, targetBounds.bottom),
        };
      }
      if (Math.abs(dRight) <= thresholdCanvas && (!bestV || Math.abs(dRight) < Math.abs(bestV.delta))) {
        bestV = {
          delta: dRight,
          x: targetBounds.right,
          y1: Math.min(sourceBounds.top, targetBounds.top),
          y2: Math.max(sourceBounds.bottom, targetBounds.bottom),
        };
      }
      var dLeftToRight = (targetBounds.right + EDGE_TO_EDGE_SNAP_GAP_PX) - sourceBounds.left;
      if (
        Math.abs(dLeftToRight) <= thresholdCanvas &&
        (!bestVCross || Math.abs(dLeftToRight) < Math.abs(bestVCross.delta))
      ) {
        bestVCross = {
          delta: dLeftToRight,
          x: targetBounds.right,
          x2: targetBounds.right + EDGE_TO_EDGE_SNAP_GAP_PX,
          y1: Math.min(sourceBounds.top, targetBounds.top),
          y2: Math.max(sourceBounds.bottom, targetBounds.bottom),
        };
      }
      var dRightToLeft = (targetBounds.left - EDGE_TO_EDGE_SNAP_GAP_PX) - sourceBounds.right;
      if (
        Math.abs(dRightToLeft) <= thresholdCanvas &&
        (!bestVCross || Math.abs(dRightToLeft) < Math.abs(bestVCross.delta))
      ) {
        bestVCross = {
          delta: dRightToLeft,
          x: targetBounds.left,
          x2: targetBounds.left - EDGE_TO_EDGE_SNAP_GAP_PX,
          y1: Math.min(sourceBounds.top, targetBounds.top),
          y2: Math.max(sourceBounds.bottom, targetBounds.bottom),
        };
      }
      if (Math.abs(dTop) <= thresholdCanvas && (!bestH || Math.abs(dTop) < Math.abs(bestH.delta))) {
        bestH = {
          delta: dTop,
          y: targetBounds.top,
          x1: Math.min(sourceBounds.left, targetBounds.left),
          x2: Math.max(sourceBounds.right, targetBounds.right),
        };
      }
      if (Math.abs(dBottom) <= thresholdCanvas && (!bestH || Math.abs(dBottom) < Math.abs(bestH.delta))) {
        bestH = {
          delta: dBottom,
          y: targetBounds.bottom,
          x1: Math.min(sourceBounds.left, targetBounds.left),
          x2: Math.max(sourceBounds.right, targetBounds.right),
        };
      }
      var dTopToBottom = (targetBounds.bottom + EDGE_TO_EDGE_SNAP_GAP_PX) - sourceBounds.top;
      if (
        Math.abs(dTopToBottom) <= thresholdCanvas &&
        (!bestHCross || Math.abs(dTopToBottom) < Math.abs(bestHCross.delta))
      ) {
        bestHCross = {
          delta: dTopToBottom,
          y: targetBounds.bottom,
          y2: targetBounds.bottom + EDGE_TO_EDGE_SNAP_GAP_PX,
          x1: Math.min(sourceBounds.left, targetBounds.left),
          x2: Math.max(sourceBounds.right, targetBounds.right),
        };
      }
      var dBottomToTop = (targetBounds.top - EDGE_TO_EDGE_SNAP_GAP_PX) - sourceBounds.bottom;
      if (
        Math.abs(dBottomToTop) <= thresholdCanvas &&
        (!bestHCross || Math.abs(dBottomToTop) < Math.abs(bestHCross.delta))
      ) {
        bestHCross = {
          delta: dBottomToTop,
          y: targetBounds.top,
          y2: targetBounds.top - EDGE_TO_EDGE_SNAP_GAP_PX,
          x1: Math.min(sourceBounds.left, targetBounds.left),
          x2: Math.max(sourceBounds.right, targetBounds.right),
        };
      }
    }

    var verticalHint = bestV || bestVCross;
    var horizontalHint = bestH || bestHCross;
    if (!verticalHint && !horizontalHint) {
      return null;
    }
    return {
      vertical: verticalHint,
      horizontal: horizontalHint,
    };
  }

  function applyGroupAlignmentDuringDrag(canvas, event) {
    if (!canvas || !ALIGNMENT_HINT_ENABLED) {
      return;
    }
    var drag = canvas.__smartGridGroupDrag;
    if (
      !drag ||
      !drag.group ||
      !drag.group.__isSmartGrid ||
      drag.group !== canvas.selected_group ||
      canvas.selected_group_resizing ||
      canvas.node_dragged ||
      canvas.resizing_node
    ) {
      if (canvas.__smartGridAlignmentState && canvas.__smartGridAlignmentMode !== "resize") {
        clearAlignmentState(canvas);
        canvas.dirty_bgcanvas = true;
      }
      return;
    }
    if (event && typeof event.buttons === "number" && (event.buttons & 1) === 0) {
      if (canvas.__smartGridAlignmentState && canvas.__smartGridAlignmentMode !== "resize") {
        clearAlignmentState(canvas);
        canvas.dirty_bgcanvas = true;
      }
      return;
    }

    var alignment = computeAlignmentState(canvas, drag.group);
    var hadState = !!canvas.__smartGridAlignmentState;
    if (!alignment) {
      if (hadState && canvas.__smartGridAlignmentMode !== "resize") {
        clearAlignmentState(canvas);
        canvas.dirty_bgcanvas = true;
      }
      return;
    }

    var bypassSnap = !!(event && event.shiftKey);
    if (ALIGNMENT_SNAP_ENABLED && !bypassSnap) {
      var dx = alignment.vertical ? alignment.vertical.delta : 0;
      var dy = alignment.horizontal ? alignment.horizontal.delta : 0;
      if (dx || dy) {
        moveGroupWithChildren(drag.group, dx, dy);
      }
    }

    canvas.__smartGridAlignmentState = alignment;
    canvas.__smartGridAlignmentMode = "drag";
    if (!hadState) {
      canvas.dirty_bgcanvas = true;
    } else {
      canvas.dirty_canvas = true;
      canvas.dirty_bgcanvas = true;
    }
  }

  function computeResizeAlignmentState(canvas, group, nextWidth, nextHeight) {
    if (!canvas || !group || !group.graph) {
      return null;
    }
    var groups = getSmartGroups(group.graph);
    if (!groups.length) {
      return null;
    }
    var left = Number(group.pos[0]) || 0;
    var top = Number(group.pos[1]) || 0;
    var right = left + Math.max(0, Number(nextWidth) || 0);
    var bottom = top + Math.max(0, Number(nextHeight) || 0);
    var scale = (canvas.ds && Number(canvas.ds.scale)) ? Number(canvas.ds.scale) : 1;
    var thresholdCanvas = ALIGNMENT_THRESHOLD_PX / Math.max(0.0001, scale);
    var bestVEdge = null;
    var bestVWidth = null;
    var bestH = null;
    var hasRightNeighbor = false;
    var closestLeftNeighbor = null;
    var closestLeftGap = Number.POSITIVE_INFINITY;
    var widthMatchThresholdCanvas = Math.max(thresholdCanvas, 24 / Math.max(0.0001, scale));

    for (var i = 0; i < groups.length; i += 1) {
      var target = groups[i];
      if (!target || target === group) {
        continue;
      }
      var tb = getGroupBounds(target);
      if (!tb) {
        continue;
      }
      var hasVerticalOverlap = !(tb.bottom < top || tb.top > bottom);
      if (hasVerticalOverlap && tb.left >= right) {
        hasRightNeighbor = true;
      }
      if (hasVerticalOverlap && tb.right <= left) {
        var leftGap = left - tb.right;
        if (leftGap < closestLeftGap) {
          closestLeftGap = leftGap;
          closestLeftNeighbor = tb;
        }
      }
      var dRightToRight = tb.right - right;
      if (
        Math.abs(dRightToRight) <= thresholdCanvas &&
        (!bestVEdge || Math.abs(dRightToRight) < Math.abs(bestVEdge.delta))
      ) {
        bestVEdge = {
          delta: dRightToRight,
          x: tb.right,
          y1: Math.min(top, tb.top),
          y2: Math.max(bottom, tb.bottom),
        };
      }
      var dRightToLeftGap = (tb.left - EDGE_TO_EDGE_SNAP_GAP_PX) - right;
      if (
        Math.abs(dRightToLeftGap) <= thresholdCanvas &&
        (!bestVEdge || Math.abs(dRightToLeftGap) < Math.abs(bestVEdge.delta))
      ) {
        bestVEdge = {
          delta: dRightToLeftGap,
          x: tb.left,
          x2: tb.left - EDGE_TO_EDGE_SNAP_GAP_PX,
          y1: Math.min(top, tb.top),
          y2: Math.max(bottom, tb.bottom),
        };
      }

      var dBottomToBottom = tb.bottom - bottom;
      if (Math.abs(dBottomToBottom) <= thresholdCanvas && (!bestH || Math.abs(dBottomToBottom) < Math.abs(bestH.delta))) {
        bestH = {
          delta: dBottomToBottom,
          y: tb.bottom,
          x1: Math.min(left, tb.left),
          x2: Math.max(right, tb.right),
        };
      }
      var dBottomToTopGap = (tb.top - EDGE_TO_EDGE_SNAP_GAP_PX) - bottom;
      if (Math.abs(dBottomToTopGap) <= thresholdCanvas && (!bestH || Math.abs(dBottomToTopGap) < Math.abs(bestH.delta))) {
        bestH = {
          delta: dBottomToTopGap,
          y: tb.top,
          y2: tb.top - EDGE_TO_EDGE_SNAP_GAP_PX,
          x1: Math.min(left, tb.left),
          x2: Math.max(right, tb.right),
        };
      }
    }

    // Width snap fallback: if nothing is to the right, use the closest SmartGrid on the left
    // as a width reference for right-edge resize guidance/snapping.
    if (!hasRightNeighbor && closestLeftNeighbor) {
      var targetRightForWidth = left + Math.max(0, closestLeftNeighbor.right - closestLeftNeighbor.left);
      var dWidthMatch = targetRightForWidth - right;
      if (Math.abs(dWidthMatch) <= widthMatchThresholdCanvas) {
        bestVWidth = {
          delta: dWidthMatch,
          x: targetRightForWidth,
          y1: Math.min(top, closestLeftNeighbor.top),
          y2: Math.max(bottom, closestLeftNeighbor.bottom),
        };
      }
    }

    var bestV = bestVEdge || bestVWidth;
    if (bestVEdge && bestVWidth) {
      var conflictThresholdCanvas = 30 / Math.max(0.0001, scale);
      var edgeSnapX = typeof bestVEdge.x2 === "number" ? bestVEdge.x2 : bestVEdge.x;
      var widthSnapX = bestVWidth.x;
      if (Math.abs(edgeSnapX - widthSnapX) <= conflictThresholdCanvas) {
        bestV = bestVEdge;
      } else {
        bestV = Math.abs(bestVEdge.delta) <= Math.abs(bestVWidth.delta) ? bestVEdge : bestVWidth;
      }
    }

    if (!bestV && !bestH) {
      return null;
    }
    return { vertical: bestV, horizontal: bestH };
  }

  function applyGroupResizeAlignmentDuringDrag(canvas, event, group, sizing) {
    if (!canvas || !group || !sizing || !ALIGNMENT_HINT_ENABLED) {
      return sizing;
    }
    var alignment = computeResizeAlignmentState(canvas, group, sizing.width, sizing.height);
    if (!alignment) {
      if (canvas.__smartGridAlignmentState && canvas.__smartGridAlignmentMode === "resize") {
        clearAlignmentState(canvas);
        canvas.dirty_bgcanvas = true;
      }
      return sizing;
    }

    var minWidth = Math.max(10, Number(sizing.minWidth) || 10);
    var minHeight = Math.max(10, Number(sizing.minHeight) || 10);
    var bypassSnap = !!(event && event.shiftKey);
    if (ALIGNMENT_SNAP_ENABLED && !bypassSnap) {
      if (alignment.vertical) {
        sizing.width = Math.max(minWidth, sizing.width + alignment.vertical.delta);
      }
      if (alignment.horizontal && !sizing.lockHeight) {
        sizing.height = Math.max(minHeight, sizing.height + alignment.horizontal.delta);
      }
    }

    canvas.__smartGridAlignmentState = alignment;
    canvas.__smartGridAlignmentMode = "resize";
    canvas.dirty_canvas = true;
    canvas.dirty_bgcanvas = true;
    return sizing;
  }

  function drawAlignmentGuides(canvas, ctx) {
    if (!canvas || !ctx || !ALIGNMENT_HINT_ENABLED) {
      return;
    }
    var state = canvas.__smartGridAlignmentState;
    if (!state) {
      return;
    }
    ctx.save();
    ctx.strokeStyle = ALIGNMENT_GUIDE_COLOR;
    ctx.lineWidth = ALIGNMENT_GUIDE_WIDTH;
    ctx.setLineDash([6, 4]);
    if (state.vertical) {
      ctx.beginPath();
      ctx.moveTo(state.vertical.x + 0.5, state.vertical.y1);
      ctx.lineTo(state.vertical.x + 0.5, state.vertical.y2);
      ctx.stroke();
      if (typeof state.vertical.x2 === "number") {
        ctx.beginPath();
        ctx.moveTo(state.vertical.x2 + 0.5, state.vertical.y1);
        ctx.lineTo(state.vertical.x2 + 0.5, state.vertical.y2);
        ctx.stroke();
      }
    }
    if (state.horizontal) {
      ctx.beginPath();
      ctx.moveTo(state.horizontal.x1, state.horizontal.y + 0.5);
      ctx.lineTo(state.horizontal.x2, state.horizontal.y + 0.5);
      ctx.stroke();
      if (typeof state.horizontal.y2 === "number") {
        ctx.beginPath();
        ctx.moveTo(state.horizontal.x1, state.horizontal.y2 + 0.5);
        ctx.lineTo(state.horizontal.x2, state.horizontal.y2 + 0.5);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function getGroupInnerMetrics(group) {
    var x = group.pos[0] + ROW_PADDING;
    var y = group.pos[1] + HEADER_HEIGHT;
    var width = Math.max(80, group.size[0] - ROW_PADDING * 2);
    var height = Math.max(40, group.size[1] - HEADER_HEIGHT - ROW_PADDING);
    return {
      x: x,
      y: y,
      width: width,
      height: height,
    };
  }

  function getGridGeometry(group) {
    var state = ensureGroupState(group);
    var metrics = getGroupInnerMetrics(group);
    var rows = state.rows;

    var totalHeights = 0;
    for (var i = 0; i < rows.length; i += 1) {
      totalHeights += Math.max(MIN_ROW_HEIGHT, rows[i].heightPx || MIN_ROW_HEIGHT);
    }
    if (!totalHeights) {
      totalHeights = MIN_ROW_HEIGHT;
    }

    var availableHeight = Math.max(metrics.height, totalHeights);
    var y = metrics.y;
    var rowRects = [];
    for (var r = 0; r < rows.length; r += 1) {
      var row = rows[r];
      var nominalHeight = Math.max(MIN_ROW_HEIGHT, row.heightPx || MIN_ROW_HEIGHT);
      var rowHeight = (nominalHeight / totalHeights) * availableHeight;
      if (r === rows.length - 1) {
        rowHeight = metrics.y + availableHeight - y;
      }

      var columns = row.columns || [];
      var x = metrics.x;
      var colRects = [];
      var resolvedWidths = Array.isArray(row.__resolvedWidthsPx) ? row.__resolvedWidthsPx : null;
      for (var c = 0; c < columns.length; c += 1) {
        var width = resolvedWidths && resolvedWidths.length > c
          ? resolvedWidths[c]
          : (metrics.width * getColumnFlexPct(columns[c])) / 100;
        if (c === columns.length - 1) {
          width = metrics.x + metrics.width - x;
        }
        colRects.push({
          x: x,
          y: y,
          width: width,
          height: rowHeight,
          rowIndex: r,
          colIndex: c,
        });
        x += width;
      }

      rowRects.push({
        x: metrics.x,
        y: y,
        width: metrics.width,
        height: rowHeight,
        rowIndex: r,
        columns: colRects,
      });
      y += rowHeight;
    }

    return {
      metrics: metrics,
      rows: rowRects,
    };
  }

  function findRowIndexAtY(group, canvasY) {
    var geometry = getGridGeometry(group);
    for (var i = 0; i < geometry.rows.length; i += 1) {
      var row = geometry.rows[i];
      if (canvasY >= row.y && canvasY <= row.y + row.height) {
        return i;
      }
    }
    return Math.max(0, geometry.rows.length - 1);
  }

  function findColumnHit(group, canvasX, canvasY) {
    if (!group || isGroupCollapsed(group)) {
      return null;
    }
    var geometry = getGridGeometry(group);
    for (var i = 0; i < geometry.rows.length; i += 1) {
      var row = geometry.rows[i];
      for (var j = 0; j < row.columns.length; j += 1) {
        var col = row.columns[j];
        if (
          canvasX >= col.x &&
          canvasX <= col.x + col.width &&
          canvasY >= col.y &&
          canvasY <= col.y + col.height
        ) {
          return {
            group: group,
            rowIndex: i,
            colIndex: j,
            rect: col,
          };
        }
      }
    }
    return null;
  }

  function getColumnInsertionHint(group, rowIndex, colIndex, cursorY, excludeNodeId) {
    var state = ensureGroupState(group);
    var row = state.rows[rowIndex];
    if (!row || !row.columns || !row.columns[colIndex]) {
      return {
        insertIndex: 0,
        lineY: cursorY,
      };
    }

    var geometry = getGridGeometry(group);
    var rowRect = geometry.rows[rowIndex];
    if (!rowRect) {
      return {
        insertIndex: 0,
        lineY: cursorY,
      };
    }

    var column = row.columns[colIndex];
    var ids = Array.isArray(column.childNodeIds) ? column.childNodeIds : [];
    var existingNodes = [];
    for (var i = 0; i < ids.length; i += 1) {
      if (excludeNodeId != null && ids[i] === excludeNodeId) {
        continue;
      }
      var node = getNodeById(group.graph, ids[i]);
      if (node && node.pos && node.size && node.size.length >= 2) {
        existingNodes.push(node);
      }
    }

    var stackTopY = rowRect.y + ROW_NODE_TOP_PADDING;
    var stackBottomY = rowRect.y + rowRect.height - ROW_NODE_BOTTOM_PADDING;
    if (!existingNodes.length) {
      return {
        insertIndex: 0,
        lineY: clamp(cursorY, stackTopY, stackBottomY),
      };
    }

    for (var n = 0; n < existingNodes.length; n += 1) {
      var current = existingNodes[n];
      var midY = current.pos[1] + current.size[1] * 0.5;
      if (cursorY < midY) {
        var beforeY = n === 0
          ? stackTopY
          : (existingNodes[n - 1].pos[1] + existingNodes[n - 1].size[1] + current.pos[1]) * 0.5;
        return {
          insertIndex: n,
          lineY: clamp(beforeY, stackTopY, stackBottomY),
        };
      }
    }

    var last = existingNodes[existingNodes.length - 1];
    var afterY = last.pos[1] + last.size[1] + NODE_VERTICAL_GAP * 0.5;
    return {
      insertIndex: existingNodes.length,
      lineY: clamp(afterY, stackTopY, stackBottomY),
    };
  }

  function getSlotTypeFromLink(graph, link) {
    if (!graph || !link) {
      return "*";
    }
    if (typeof link.type === "string" && link.type) {
      return link.type;
    }
    var originNode = getNodeById(graph, link.origin_id);
    if (
      originNode &&
      Array.isArray(originNode.outputs) &&
      originNode.outputs[link.origin_slot] &&
      originNode.outputs[link.origin_slot].type
    ) {
      return String(originNode.outputs[link.origin_slot].type);
    }
    var targetNode = getNodeById(graph, link.target_id);
    if (
      targetNode &&
      Array.isArray(targetNode.inputs) &&
      targetNode.inputs[link.target_slot] &&
      targetNode.inputs[link.target_slot].type
    ) {
      return String(targetNode.inputs[link.target_slot].type);
    }
    return "*";
  }

  function getConnectionPoint(node, isInput, slotIndex) {
    if (!node) {
      return null;
    }
    if (typeof node.getConnectionPos === "function") {
      try {
        var pos = node.getConnectionPos(!!isInput, slotIndex);
        if (pos && pos.length >= 2) {
          return [Number(pos[0]) || 0, Number(pos[1]) || 0];
        }
      } catch (error) {
        // Fall through to approximated connection point.
      }
    }
    var x = node.pos && node.pos.length ? node.pos[0] : 0;
    var y = node.pos && node.pos.length > 1 ? node.pos[1] : 0;
    var width = node.size && node.size.length ? node.size[0] : 120;
    var slotH = window.LiteGraph && window.LiteGraph.NODE_SLOT_HEIGHT
      ? window.LiteGraph.NODE_SLOT_HEIGHT
      : 14;
    var py = y + 20 + slotH * (slotIndex + 0.5);
    return [isInput ? x : x + width, py];
  }

  function getCollapsedGroupProxyState(graph) {
    var state = {
      groupMeta: [],
      links: {},
    };
    if (!graph || !graph.links) {
      return state;
    }

    var smartGroups = getSmartGroups(graph);
    for (var g = 0; g < smartGroups.length; g += 1) {
      var group = smartGroups[g];
      if (!isGroupCollapsed(group)) {
        continue;
      }
      state.groupMeta.push({
        group: group,
        inboundCounts: {},
        outboundCounts: {},
        inboundOrder: [],
        outboundOrder: [],
        inboundAnchors: {},
        outboundAnchors: {},
      });
    }
    if (!state.groupMeta.length) {
      return state;
    }

    function getMeta(group) {
      for (var i = 0; i < state.groupMeta.length; i += 1) {
        if (state.groupMeta[i].group === group) {
          return state.groupMeta[i];
        }
      }
      return null;
    }

    function addCount(meta, dirKey, type) {
      var counts = dirKey === "inbound" ? meta.inboundCounts : meta.outboundCounts;
      var order = dirKey === "inbound" ? meta.inboundOrder : meta.outboundOrder;
      if (!Object.prototype.hasOwnProperty.call(counts, type)) {
        counts[type] = 0;
        order.push(type);
      }
      counts[type] += 1;
    }

    for (var linkId in graph.links) {
      if (!Object.prototype.hasOwnProperty.call(graph.links, linkId)) {
        continue;
      }
      var link = graph.links[linkId];
      if (!link) {
        continue;
      }
      var originGroup = findManagingGroupForNode(graph, link.origin_id);
      var targetGroup = findManagingGroupForNode(graph, link.target_id);
      var collapsedOrigin = originGroup && isGroupCollapsed(originGroup) ? originGroup : null;
      var collapsedTarget = targetGroup && isGroupCollapsed(targetGroup) ? targetGroup : null;
      if (!collapsedOrigin && !collapsedTarget) {
        continue;
      }
      if (collapsedOrigin && collapsedTarget && collapsedOrigin === collapsedTarget) {
        continue;
      }
      var type = getSlotTypeFromLink(graph, link);
      if (collapsedOrigin) {
        var originMeta = getMeta(collapsedOrigin);
        if (originMeta) {
          addCount(originMeta, "outbound", type);
        }
      }
      if (collapsedTarget) {
        var targetMeta = getMeta(collapsedTarget);
        if (targetMeta) {
          addCount(targetMeta, "inbound", type);
        }
      }
      var key = link.id != null ? String(link.id) : String(linkId);
      state.links[key] = {
        link: link,
        type: type,
        originCollapsedGroup: collapsedOrigin,
        targetCollapsedGroup: collapsedTarget,
      };
    }

    for (var m = 0; m < state.groupMeta.length; m += 1) {
      var meta = state.groupMeta[m];
      meta.inboundOrder.sort();
      meta.outboundOrder.sort();
      var group = meta.group;
      var centerY = group.pos[1] + group.size[1] * 0.5;
      var leftX = group.pos[0] + 2;
      var rightX = group.pos[0] + group.size[0] - 2;

      for (var iIn = 0; iIn < meta.inboundOrder.length; iIn += 1) {
        var inType = meta.inboundOrder[iIn];
        var inY = centerY + (iIn - (meta.inboundOrder.length - 1) * 0.5) * COLLAPSED_ANCHOR_GAP;
        meta.inboundAnchors[inType] = [leftX, inY];
      }
      for (var iOut = 0; iOut < meta.outboundOrder.length; iOut += 1) {
        var outType = meta.outboundOrder[iOut];
        var outY = centerY + (iOut - (meta.outboundOrder.length - 1) * 0.5) * COLLAPSED_ANCHOR_GAP;
        meta.outboundAnchors[outType] = [rightX, outY];
      }
    }

    return state;
  }

  function findGroupMetaForProxy(proxyState, group) {
    if (!proxyState || !group || !Array.isArray(proxyState.groupMeta)) {
      return null;
    }
    for (var i = 0; i < proxyState.groupMeta.length; i += 1) {
      if (proxyState.groupMeta[i].group === group) {
        return proxyState.groupMeta[i];
      }
    }
    return null;
  }

  function extractLinkFromRenderArgs(argsLike) {
    if (!argsLike || argsLike.length < 4) {
      return null;
    }
    for (var i = 3; i < argsLike.length; i += 1) {
      var candidate = argsLike[i];
      if (
        candidate &&
        typeof candidate === "object" &&
        candidate.origin_id != null &&
        candidate.target_id != null
      ) {
        return candidate;
      }
    }
    return null;
  }

  function getProxyAnchorForLink(proxyState, group, direction, type) {
    var meta = findGroupMetaForProxy(proxyState, group);
    if (!meta) {
      return null;
    }
    if (direction === "inbound") {
      return meta.inboundAnchors[type] || meta.inboundAnchors["*"] || null;
    }
    return meta.outboundAnchors[type] || meta.outboundAnchors["*"] || null;
  }

  function resolveRenderEndpointsForCollapsedGroups(canvas, link, start, end) {
    if (!canvas || !canvas.graph || !link || !start || !end) {
      return null;
    }
    var graph = canvas.graph;
    var originGroup = findManagingGroupForNode(graph, link.origin_id);
    var targetGroup = findManagingGroupForNode(graph, link.target_id);
    var collapsedOrigin = originGroup && isGroupCollapsed(originGroup) ? originGroup : null;
    var collapsedTarget = targetGroup && isGroupCollapsed(targetGroup) ? targetGroup : null;
    if (!collapsedOrigin && !collapsedTarget) {
      return null;
    }
    if (collapsedOrigin && collapsedTarget && collapsedOrigin === collapsedTarget) {
      return {
        hidden: true,
      };
    }

    var proxyState = canvas.__smartGridProxyState || getCollapsedGroupProxyState(graph);
    canvas.__smartGridProxyState = proxyState;
    var type = getSlotTypeFromLink(graph, link);
    var a = [start[0], start[1]];
    var b = [end[0], end[1]];
    if (collapsedOrigin) {
      var outAnchor = getProxyAnchorForLink(proxyState, collapsedOrigin, "outbound", type);
      if (outAnchor) {
        a = [outAnchor[0], outAnchor[1]];
      }
    }
    if (collapsedTarget) {
      var inAnchor = getProxyAnchorForLink(proxyState, collapsedTarget, "inbound", type);
      if (inAnchor) {
        b = [inAnchor[0], inAnchor[1]];
      }
    }
    return {
      hidden: false,
      start: a,
      end: b,
    };
  }

  function findSplitterHit(canvas, canvasX, canvasY) {
    if (!canvas || !canvas.graph) {
      return null;
    }
    var groups = getSmartGroups(canvas.graph);
    for (var g = groups.length - 1; g >= 0; g -= 1) {
      var group = groups[g];
      if (isGroupCollapsed(group)) {
        continue;
      }
      if (!group.isPointInside(canvasX, canvasY, 0, true)) {
        continue;
      }
      var geometry = getGridGeometry(group);
      var rows = geometry.rows;
      for (var r = 0; r < rows.length; r += 1) {
        var row = rows[r];
        if (canvasY < row.y || canvasY > row.y + row.height) {
          continue;
        }
        for (var c = 0; c < row.columns.length - 1; c += 1) {
          var splitX = row.columns[c].x + row.columns[c].width;
          if (Math.abs(canvasX - splitX) <= SPLITTER_HITBOX) {
            return {
              group: group,
              rowIndex: r,
              leftIndex: c,
              rightIndex: c + 1,
              splitX: splitX,
            };
          }
        }
      }
    }
    return null;
  }

  function findRowDividerHit(canvas, canvasX, canvasY) {
    if (!canvas || !canvas.graph) {
      return null;
    }
    var groups = getSmartGroups(canvas.graph);
    for (var g = groups.length - 1; g >= 0; g -= 1) {
      var group = groups[g];
      if (isGroupCollapsed(group)) {
        continue;
      }
      if (!group.isPointInside(canvasX, canvasY, 0, true)) {
        continue;
      }
      var geometry = getGridGeometry(group);
      var rows = geometry.rows;
      // Inner horizontal dividers only (exclude bottom edge).
      for (var r = 0; r < rows.length - 1; r += 1) {
        var row = rows[r];
        var splitY = row.y + row.height;
        if (canvasX < row.x || canvasX > row.x + row.width) {
          continue;
        }
        if (Math.abs(canvasY - splitY) <= SPLITTER_HITBOX) {
          return {
            group: group,
            upperIndex: r,
            lowerIndex: r + 1,
            splitY: splitY,
          };
        }
      }
    }
    return null;
  }

  function getAutofitButtonRect(group) {
    if (!group || !group.pos || !group.size) {
      return null;
    }
    var width = Math.min(AUTOFIT_BUTTON_WIDTH, Math.max(48, Math.floor(group.size[0] * 0.4)));
    var collapseRect = getCollapseButtonRect(group);
    var x = collapseRect
      ? collapseRect.x - AUTOFIT_BUTTON_MARGIN - width
      : (group.pos[0] + group.size[0] - AUTOFIT_BUTTON_MARGIN - width);
    var y = group.pos[1] + AUTOFIT_BUTTON_MARGIN;
    return {
      x: x,
      y: y,
      width: width,
      height: AUTOFIT_BUTTON_HEIGHT,
    };
  }

  function getCollapseButtonRect(group) {
    if (!group || !group.pos || !group.size) {
      return null;
    }
    var width = Math.min(COLLAPSE_BUTTON_WIDTH, Math.max(56, Math.floor(group.size[0] * 0.45)));
    var x = group.pos[0] + group.size[0] - AUTOFIT_BUTTON_MARGIN - width;
    var y = group.pos[1] + AUTOFIT_BUTTON_MARGIN;
    return {
      x: x,
      y: y,
      width: width,
      height: COLLAPSE_BUTTON_HEIGHT,
    };
  }

  var __smartGridMeasureCtx = null;
  function measureTextWidth(text, font) {
    if (!__smartGridMeasureCtx && typeof document !== "undefined") {
      var canvas = document.createElement("canvas");
      __smartGridMeasureCtx = canvas.getContext("2d");
    }
    if (!__smartGridMeasureCtx) {
      return String(text || "").length * 8;
    }
    __smartGridMeasureCtx.save();
    if (font) {
      __smartGridMeasureCtx.font = font;
    }
    var width = __smartGridMeasureCtx.measureText(String(text || "")).width;
    __smartGridMeasureCtx.restore();
    return width || 0;
  }

  function clipTextToWidth(text, maxWidth, font) {
    var value = String(text || "");
    if (maxWidth <= 0) {
      return "";
    }
    if (measureTextWidth(value, font) <= maxWidth) {
      return value;
    }
    var ellipsis = "...";
    var ellipsisWidth = measureTextWidth(ellipsis, font);
    if (ellipsisWidth >= maxWidth) {
      return "";
    }
    var lo = 0;
    var hi = value.length;
    while (lo < hi) {
      var mid = Math.ceil((lo + hi) * 0.5);
      var candidate = value.slice(0, mid) + ellipsis;
      if (measureTextWidth(candidate, font) <= maxWidth) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return value.slice(0, lo) + ellipsis;
  }

  function getCollapsedTitleMaxWidth(group) {
    if (!group || !group.pos || !group.size) {
      return MAX_COLLAPSED_TITLE_WIDTH;
    }
    var collapseRect = getCollapseButtonRect(group);
    var left = group.pos[0] + COLLAPSED_HEADER_SIDE_PADDING;
    var right = collapseRect
      ? collapseRect.x - COLLAPSED_TITLE_BUTTON_GAP
      : (group.pos[0] + group.size[0] - COLLAPSED_HEADER_SIDE_PADDING);
    return Math.max(40, Math.min(MAX_COLLAPSED_TITLE_WIDTH, right - left));
  }

  function getCollapsedDisplayTitle(group) {
    var title = group && group.title ? group.title : "Group";
    var maxWidth = getCollapsedTitleMaxWidth(group);
    return clipTextToWidth(title, maxWidth, COLLAPSED_TITLE_FONT);
  }

  function getAnyGraphCanvas(graph) {
    if (!graph || !graph.list_of_graphcanvas || !graph.list_of_graphcanvas.length) {
      return null;
    }
    for (var i = 0; i < graph.list_of_graphcanvas.length; i += 1) {
      if (graph.list_of_graphcanvas[i]) {
        return graph.list_of_graphcanvas[i];
      }
    }
    return null;
  }

  function getCollapsedProxyWidthRequirement(group, canvas) {
    if (!group || !group.graph) {
      return 0;
    }
    var proxyState = null;
    if (canvas && canvas.__smartGridProxyState) {
      proxyState = canvas.__smartGridProxyState;
    } else {
      proxyState = getCollapsedGroupProxyState(group.graph);
    }
    var meta = findGroupMetaForProxy(proxyState, group);
    if (!meta) {
      return 0;
    }
    var maxInbound = 0;
    var maxOutbound = 0;
    var inCounts = meta.inboundCounts || {};
    var outCounts = meta.outboundCounts || {};
    for (var inType in inCounts) {
      if (!Object.prototype.hasOwnProperty.call(inCounts, inType)) {
        continue;
      }
      var inLabel = String(inType) + " x" + String(inCounts[inType] || 0);
      maxInbound = Math.max(maxInbound, measureTextWidth(inLabel, "10px Arial"));
    }
    for (var outType in outCounts) {
      if (!Object.prototype.hasOwnProperty.call(outCounts, outType)) {
        continue;
      }
      var outLabel = String(outType) + " x" + String(outCounts[outType] || 0);
      maxOutbound = Math.max(maxOutbound, measureTextWidth(outLabel, "10px Arial"));
    }
    if (!maxInbound && !maxOutbound) {
      return 0;
    }
    return Math.ceil(
      COLLAPSED_PROXY_LABEL_PADDING * 2 +
      8 + maxInbound +
      COLLAPSED_PROXY_LABEL_CENTER_GAP +
      8 + maxOutbound
    );
  }

  function computeCollapsedGroupWidth(group, canvas) {
    if (!group) {
      return COLLAPSED_MIN_WIDTH;
    }
    var title = group.title || "Group";
    var buttonWidth = Math.min(COLLAPSE_BUTTON_WIDTH, Math.max(56, Math.floor(COLLAPSED_MIN_WIDTH * 0.45)));
    var titleWidth = Math.min(
      MAX_COLLAPSED_TITLE_WIDTH,
      Math.ceil(measureTextWidth(title, COLLAPSED_TITLE_FONT))
    );
    var headerWidth = Math.ceil(
      COLLAPSED_HEADER_SIDE_PADDING * 2 +
      titleWidth +
      COLLAPSED_TITLE_BUTTON_GAP +
      buttonWidth
    );
    var proxyWidth = getCollapsedProxyWidthRequirement(group, canvas);
    var nextWidth = Math.max(COLLAPSED_MIN_WIDTH, headerWidth, proxyWidth);
    return Math.max(COLLAPSED_MIN_WIDTH, roundToSnapPixels(nextWidth));
  }

  function pointInRect(x, y, rect) {
    return (
      !!rect &&
      x >= rect.x &&
      x <= rect.x + rect.width &&
      y >= rect.y &&
      y <= rect.y + rect.height
    );
  }

  function findAutofitButtonHit(canvas, canvasX, canvasY) {
    if (!canvas || !canvas.graph) {
      return null;
    }
    var groups = getSmartGroups(canvas.graph);
    for (var g = groups.length - 1; g >= 0; g -= 1) {
      var group = groups[g];
      if (!group.isPointInside(canvasX, canvasY, 0, true)) {
        continue;
      }
      var rect = getAutofitButtonRect(group);
      if (pointInRect(canvasX, canvasY, rect)) {
        return {
          group: group,
          rect: rect,
        };
      }
    }
    return null;
  }

  function findCollapseButtonHit(canvas, canvasX, canvasY) {
    if (!canvas || !canvas.graph) {
      return null;
    }
    var groups = getSmartGroups(canvas.graph);
    for (var g = groups.length - 1; g >= 0; g -= 1) {
      var group = groups[g];
      if (!group.isPointInside(canvasX, canvasY, 0, true)) {
        continue;
      }
      var rect = getCollapseButtonRect(group);
      if (pointInRect(canvasX, canvasY, rect)) {
        return {
          group: group,
          rect: rect,
        };
      }
    }
    return null;
  }

  function setGroupCollapsed(group, collapsed, shouldPush) {
    if (!group || !group.__isSmartGrid) {
      return;
    }
    var state = ensureGroupState(group);
    var target = !!collapsed;
    if (!!state.collapsed === target) {
      return;
    }
    if (target) {
      state.expandedSize = [group.size[0], group.size[1]];
      state.collapsed = true;
      group.size[0] = computeCollapsedGroupWidth(group, getAnyGraphCanvas(group.graph));
      updateLayout(group, !!shouldPush);
    } else {
      state.collapsed = false;
      if (state.expandedSize && state.expandedSize.length >= 2) {
        group.size[0] = Math.max(group.size[0], Number(state.expandedSize[0]) || group.size[0]);
        group.size[1] = Math.max(COLLAPSED_GROUP_HEIGHT, Number(state.expandedSize[1]) || group.size[1]);
      }
      updateLayout(group, !!shouldPush);
    }
    group.setDirtyCanvas(true, true);
  }

  function toggleGroupCollapsed(group, shouldPush) {
    setGroupCollapsed(group, !isGroupCollapsed(group), shouldPush);
  }

  function autofitSmartGridRows(group) {
    if (!group || !group.__isSmartGrid) {
      return;
    }
    var state = ensureGroupState(group);
    for (var r = 0; r < state.rows.length; r += 1) {
      var nextHeight = getRowRequiredHeightPx(group, r);
      state.rows[r].__manualHeightPx = nextHeight;
      state.rows[r].heightPx = nextHeight;
    }
    updateLayout(group, false);
    group.setDirtyCanvas(true, true);
  }

  function getColumnHorizontalInsets(columnCount, colIndex) {
    var half = INNER_NODE_PADDING * 0.5;
    // Outer gutter is already provided by ROW_PADDING in getGroupInnerMetrics(),
    // so keep edge insets at 0 to avoid doubling outside spacing.
    var left = colIndex === 0 ? 0 : half;
    var right = colIndex === columnCount - 1 ? 0 : half;
    return {
      left: left,
      right: right,
      total: left + right,
    };
  }

  function getColumnRequiredNodeWidth(group, rowIndex, colIndex) {
    var state = ensureGroupState(group);
    var row = state.rows[rowIndex];
    if (!row || !row.columns[colIndex]) {
      return 0;
    }
    var column = row.columns[colIndex];
    var maxNodeWidth = 0;
    var ids = Array.isArray(column.childNodeIds) ? column.childNodeIds : [];
    for (var i = 0; i < ids.length; i += 1) {
      var node = getNodeById(group.graph, ids[i]);
      if (!node) {
        continue;
      }
      var minSize = getNodeIntrinsicMinSize(node);
      var width = Number(minSize[0]) || 0;
      if (width > maxNodeWidth) {
        maxNodeWidth = width;
      }
    }
    return maxNodeWidth;
  }

  function getColumnMinWidthPx(group, rowIndex, colIndex) {
    var state = ensureGroupState(group);
    var row = state.rows[rowIndex];
    if (!row || !row.columns[colIndex]) {
      return 20;
    }
    var insets = getColumnHorizontalInsets(row.columns.length, colIndex);
    var maxWidth = getColumnRequiredNodeWidth(group, rowIndex, colIndex);
    return Math.max(20, maxWidth + insets.total);
  }

  function getRowRequiredHeightPx(group, rowIndex) {
    var state = ensureGroupState(group);
    var row = state.rows[rowIndex];
    if (!row || !Array.isArray(row.columns)) {
      return MIN_ROW_HEIGHT;
    }
    var rowContentHeight = Math.max(24, MIN_ROW_HEIGHT - ROW_NODE_TOP_PADDING - ROW_NODE_BOTTOM_PADDING);
    for (var c = 0; c < row.columns.length; c += 1) {
      var ids = row.columns[c].childNodeIds || [];
      var columnContentHeight = 0;
      for (var i = 0; i < ids.length; i += 1) {
        var node = getNodeById(group.graph, ids[i]);
        if (!node) {
          continue;
        }
        var minSize = getNodeIntrinsicMinSize(node);
        var minHeight = Math.max(0, Number(minSize[1]) || 0);
        var manualHeight = node.__smartGridManualSize && node.__smartGridManualSize.length >= 2
          ? Math.max(0, Number(node.__smartGridManualSize[1]) || 0)
          : 0;
        var requiredHeight = Math.max(minHeight, manualHeight);
        columnContentHeight += requiredHeight;
      }
      if (ids.length > 1) {
        columnContentHeight += NODE_VERTICAL_GAP * (ids.length - 1);
      }
      if (columnContentHeight > rowContentHeight) {
        rowContentHeight = columnContentHeight;
      }
    }
    return Math.max(
      MIN_ROW_HEIGHT,
      rowContentHeight + ROW_NODE_TOP_PADDING + ROW_NODE_BOTTOM_PADDING
    );
  }

  function getGroupMinWidthPx(group) {
    var state = ensureGroupState(group);
    if (!state || !Array.isArray(state.rows) || !state.rows.length) {
      return 140;
    }

    var requiredInnerWidth = 0;
    for (var r = 0; r < state.rows.length; r += 1) {
      var row = state.rows[r];
      var rowWidth = 0;
      var columns = row && Array.isArray(row.columns) ? row.columns : [];
      for (var c = 0; c < columns.length; c += 1) {
        rowWidth += getColumnMinWidthPx(group, r, c);
      }
      if (rowWidth > requiredInnerWidth) {
        requiredInnerWidth = rowWidth;
      }
    }

    return Math.max(140, Math.ceil(requiredInnerWidth + ROW_PADDING * 2));
  }

  function getGroupMinHeightPx(group) {
    var state = ensureGroupState(group);
    if (!state || !Array.isArray(state.rows) || !state.rows.length) {
      return 80;
    }
    var totalRowsHeight = 0;
    for (var r = 0; r < state.rows.length; r += 1) {
      var row = state.rows[r];
      var rowBase = Math.max(MIN_ROW_HEIGHT, Number(row && row.heightPx) || MIN_ROW_HEIGHT);
      var rowRequired = getRowRequiredHeightPx(group, r);
      totalRowsHeight += Math.max(rowBase, rowRequired);
    }
    return Math.max(80, Math.round(HEADER_HEIGHT + totalRowsHeight + ROW_PADDING * 0.5));
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function getSafeNodeAxis(value, fallback) {
    var numeric = Number(value);
    if (!isFinite(numeric)) {
      return fallback;
    }
    return numeric;
  }

  function roundToSnapPercent(value) {
    return Math.round(value / SNAP_INCREMENT) * SNAP_INCREMENT;
  }

  function roundToSnapPixels(value) {
    return Math.round(value / SNAP_INCREMENT) * SNAP_INCREMENT;
  }

  function getColumnFlexPct(column) {
    if (!column) {
      return 0;
    }
    if (column.flexPct == null && column.widthPct != null) {
      column.flexPct = Number(column.widthPct) || 0;
    }
    return Number(column.flexPct) || 0;
  }

  function normalizeRowFlexPercents(row) {
    if (!row || !Array.isArray(row.columns) || !row.columns.length) {
      return;
    }
    var total = 0;
    for (var i = 0; i < row.columns.length; i += 1) {
      var pct = getColumnFlexPct(row.columns[i]);
      row.columns[i].flexPct = pct;
      row.columns[i].widthPct = pct;
      total += pct;
    }
    if (total <= 0) {
      var equal = 100 / row.columns.length;
      for (var j = 0; j < row.columns.length; j += 1) {
        row.columns[j].flexPct = equal;
        row.columns[j].widthPct = equal;
      }
      return;
    }
    for (var k = 0; k < row.columns.length; k += 1) {
      row.columns[k].flexPct = (row.columns[k].flexPct / total) * 100;
      row.columns[k].widthPct = row.columns[k].flexPct;
    }
    var sum = 0;
    for (var x = 0; x < row.columns.length; x += 1) {
      sum += row.columns[x].flexPct;
    }
    row.columns[row.columns.length - 1].flexPct += 100 - sum;
    row.columns[row.columns.length - 1].widthPct = row.columns[row.columns.length - 1].flexPct;
  }

  function resolveRowColumnWidthsPx(totalWidth, row, minWidths) {
    if (!row || !Array.isArray(row.columns) || !row.columns.length) {
      return [];
    }
    normalizeRowFlexPercents(row);

    var minimums = [];
    var minTotal = 0;
    for (var i = 0; i < row.columns.length; i += 1) {
      var minWidth = Math.max(0, Number(minWidths[i]) || 0);
      minimums.push(minWidth);
      minTotal += minWidth;
    }

    var freeSpace = Math.max(0, totalWidth - minTotal);
    var finalWidths = new Array(row.columns.length);
    var used = 0;
    for (var k = 0; k < row.columns.length; k += 1) {
      var pct = getColumnFlexPct(row.columns[k]);
      var share = k === row.columns.length - 1
        ? (freeSpace - used)
        : (freeSpace * pct) / 100;
      share = Math.max(0, share);
      finalWidths[k] = minimums[k] + share;
      used += share;
    }

    row.__resolvedMinTotalPx = minTotal;
    row.__resolvedWidthsPx = finalWidths;
    return finalWidths;
  }

  function findManagingGroupForNode(graph, nodeId) {
    if (!graph || nodeId == null) {
      return null;
    }
    var groups = getSmartGroups(graph);
    for (var g = 0; g < groups.length; g += 1) {
      var state = ensureGroupState(groups[g]);
      for (var r = 0; r < state.rows.length; r += 1) {
        var row = state.rows[r];
        for (var c = 0; c < row.columns.length; c += 1) {
          var ids = row.columns[c].childNodeIds || [];
          if (ids.indexOf(nodeId) !== -1) {
            return groups[g];
          }
        }
      }
    }
    return null;
  }

  function findManagedNodeLocation(group, nodeId) {
    if (!group || !group.graph || nodeId == null) {
      return null;
    }
    var state = ensureGroupState(group);
    for (var r = 0; r < state.rows.length; r += 1) {
      var row = state.rows[r];
      for (var c = 0; c < row.columns.length; c += 1) {
        var ids = row.columns[c].childNodeIds || [];
        if (ids.indexOf(nodeId) !== -1) {
          return {
            rowIndex: r,
            colIndex: c,
            row: row,
            column: row.columns[c],
          };
        }
      }
    }
    return null;
  }

  function getManagedNodeResizeBounds(node) {
    if (!node || !node.graph || node.id == null) {
      return null;
    }
    var group = findManagingGroupForNode(node.graph, node.id);
    if (!group) {
      return null;
    }
    var location = findManagedNodeLocation(group, node.id);
    if (!location) {
      return null;
    }
    var geometry = getGridGeometry(group);
    var rowRect = geometry.rows[location.rowIndex];
    if (!rowRect || !rowRect.columns || !rowRect.columns[location.colIndex]) {
      return null;
    }
    var colRect = rowRect.columns[location.colIndex];
    var insets = getColumnHorizontalInsets(rowRect.columns.length, location.colIndex);
    var minSize = getNodeIntrinsicMinSize(node);
    var minWidth = Math.max(0, Number(minSize[0]) || 0);
    var minHeight = Math.max(0, Number(minSize[1]) || 0);
    var columnWidth = Math.max(40, Math.round(colRect.width - insets.total));
    var rowHeight = Math.max(24, Math.round(rowRect.height - ROW_NODE_TOP_PADDING - ROW_NODE_BOTTOM_PADDING));
    var singleNodeColumn = ((location.column.childNodeIds || []).length <= 1);
    var rowNodeCount = 0;
    for (var i = 0; i < location.row.columns.length; i += 1) {
      rowNodeCount += (location.row.columns[i].childNodeIds || []).length;
    }
    var singleNodeRow = rowNodeCount <= 1;

    // Managed widths are column-driven; single-node columns also have row-driven heights.
    var boundedMinWidth = Math.max(minWidth, columnWidth);
    var boundedMaxWidth = boundedMinWidth;
    // Keep intrinsic minimum height so docked nodes can both grow and shrink.
    var boundedMinHeight = minHeight;
    // Allow vertical resizing for managed nodes; row growth is reconciled on mouse-up.
    var boundedMaxHeight = Number.POSITIVE_INFINITY;

    return {
      minWidth: boundedMinWidth,
      maxWidth: boundedMaxWidth,
      minHeight: boundedMinHeight,
      maxHeight: boundedMaxHeight,
    };
  }

  function isManagedNodeResizeLocked(node) {
    var bounds = getManagedNodeResizeBounds(node);
    if (!bounds) {
      return false;
    }
    var widthLocked = Math.abs(bounds.maxWidth - bounds.minWidth) < 0.5;
    var heightLocked = isFinite(bounds.maxHeight) && Math.abs(bounds.maxHeight - bounds.minHeight) < 0.5;
    return widthLocked && heightLocked;
  }

  function queueGroupRelayout(group, shouldPush) {
    if (!group || !group.__isSmartGrid) {
      return;
    }
    if (group.__smartGridRelayoutQueued) {
      group.__smartGridRelayoutShouldPush = group.__smartGridRelayoutShouldPush || !!shouldPush;
      return;
    }
    group.__smartGridRelayoutQueued = true;
    group.__smartGridRelayoutShouldPush = !!shouldPush;
    setTimeout(function () {
      var push = !!group.__smartGridRelayoutShouldPush;
      group.__smartGridRelayoutQueued = false;
      group.__smartGridRelayoutShouldPush = false;
      if (!group.graph || !group.__isSmartGrid) {
        return;
      }
      updateLayout(group, push);
      group.setDirtyCanvas(true, true);
    }, 0);
  }

  function relayoutAllSmartGroups(graph) {
    if (!graph) {
      return;
    }
    var groups = getSmartGroups(graph);
    for (var i = 0; i < groups.length; i += 1) {
      updateLayout(groups[i], false);
      groups[i].setDirtyCanvas(true, true);
    }
    if (graph.list_of_graphcanvas && graph.list_of_graphcanvas.length) {
      for (var c = 0; c < graph.list_of_graphcanvas.length; c += 1) {
        var canvas = graph.list_of_graphcanvas[c];
        if (canvas) {
          canvas.dirty_canvas = true;
          canvas.dirty_bgcanvas = true;
        }
      }
    }
  }

  function isXOverlap(aLeft, aRight, bLeft, bRight) {
    return aLeft < bRight && aRight > bLeft;
  }

  function pushItemsBelow(group, deltaY, oldBottom) {
    if (!group || !group.graph || !deltaY) {
      return;
    }
    var graph = group.graph;
    var groupLeft = group.pos[0];
    var groupRight = group.pos[0] + group.size[0];

    if (Array.isArray(graph._nodes)) {
      for (var i = 0; i < graph._nodes.length; i += 1) {
        var node = graph._nodes[i];
        if (!node || node.pos[1] < oldBottom) {
          continue;
        }
        var nodeLeft = node.pos[0];
        var nodeRight = node.pos[0] + (node.size ? node.size[0] : 0);
        if (isXOverlap(groupLeft, groupRight, nodeLeft, nodeRight)) {
          node.pos[1] += deltaY;
        }
      }
    }

    if (Array.isArray(graph._groups)) {
      for (var g = 0; g < graph._groups.length; g += 1) {
        var other = graph._groups[g];
        if (!other || other === group || other.pos[1] < oldBottom) {
          continue;
        }
        var otherLeft = other.pos[0];
        var otherRight = other.pos[0] + other.size[0];
        if (isXOverlap(groupLeft, groupRight, otherLeft, otherRight)) {
          other.pos[1] += deltaY;
        }
      }
    }
  }

  function getColumnByIndex(group, rowIndex, colIndex) {
    var state = ensureGroupState(group);
    var row = state.rows[rowIndex];
    if (!row || !row.columns || !row.columns[colIndex]) {
      return null;
    }
    return row.columns[colIndex];
  }

  function addUniqueGroup(list, group) {
    if (!list || !group) {
      return;
    }
    if (list.indexOf(group) === -1) {
      list.push(group);
    }
  }

  function removeNodeFromAllSmartColumns(graph, nodeId) {
    if (!graph || nodeId == null) {
      return [];
    }
    var removed = false;
    var affected = [];
    var groups = getSmartGroups(graph);
    for (var g = 0; g < groups.length; g += 1) {
      var groupChanged = false;
      var state = ensureGroupState(groups[g]);
      for (var r = 0; r < state.rows.length; r += 1) {
        var row = state.rows[r];
        for (var c = 0; c < row.columns.length; c += 1) {
          var ids = row.columns[c].childNodeIds || [];
          var idx = ids.indexOf(nodeId);
          if (idx !== -1) {
            ids.splice(idx, 1);
            removed = true;
            groupChanged = true;
          }
        }
      }
      if (groupChanged) {
        syncSmartGridGroupChildren(groups[g]);
        affected.push(groups[g]);
      }
    }
    if (removed) {
      var node = getNodeById(graph, nodeId);
      if (node) {
        node.__smartGridManaged = false;
      }
    }
    return affected;
  }

  function clampManagedNodeSize(node, width, height) {
    var FALLBACK_MIN = 10;
    if (!node) {
      return [
        Math.max(FALLBACK_MIN, getSafeNodeAxis(width, FALLBACK_MIN)),
        Math.max(FALLBACK_MIN, getSafeNodeAxis(height, FALLBACK_MIN)),
      ];
    }

    var bounds = getManagedNodeResizeBounds(node);
    var intrinsicMin = getNodeIntrinsicMinSize(node);
    var minWidth = Math.max(FALLBACK_MIN, getSafeNodeAxis(intrinsicMin[0], FALLBACK_MIN));
    var minHeight = Math.max(FALLBACK_MIN, getSafeNodeAxis(intrinsicMin[1], FALLBACK_MIN));
    var maxWidth = Number.POSITIVE_INFINITY;
    var maxHeight = Number.POSITIVE_INFINITY;

    if (bounds) {
      minWidth = Math.max(FALLBACK_MIN, getSafeNodeAxis(bounds.minWidth, minWidth));
      minHeight = Math.max(FALLBACK_MIN, getSafeNodeAxis(bounds.minHeight, minHeight));
      if (isFinite(bounds.maxWidth)) {
        maxWidth = Math.max(minWidth, getSafeNodeAxis(bounds.maxWidth, minWidth));
      }
      if (isFinite(bounds.maxHeight)) {
        maxHeight = Math.max(minHeight, getSafeNodeAxis(bounds.maxHeight, minHeight));
      }
    }

    var safeWidth = Math.max(minWidth, getSafeNodeAxis(width, minWidth));
    var safeHeight = Math.max(minHeight, getSafeNodeAxis(height, minHeight));
    if (isFinite(maxWidth)) {
      safeWidth = Math.min(safeWidth, maxWidth);
    }
    if (isFinite(maxHeight)) {
      safeHeight = Math.min(safeHeight, maxHeight);
    }
    return [safeWidth, safeHeight];
  }

  function ensureManagedNodeResizeHook(node) {
    if (!node || node.__smartGridResizeHooked) {
      return;
    }
    var originalOnResize = typeof node.onResize === "function" ? node.onResize : null;
    node.onResize = function (size) {
      if (this.__smartGridManaged && !this.__smartGridLayoutSizing) {
        var target = [0, 0];
        if (size && size.length >= 2) {
          target = [getSafeNodeAxis(size[0], 0), getSafeNodeAxis(size[1], 0)];
        } else if (this.size && this.size.length >= 2) {
          target = [getSafeNodeAxis(this.size[0], 0), getSafeNodeAxis(this.size[1], 0)];
        }
        var clamped = clampManagedNodeSize(this, target[0], target[1]);
        if (!this.size || this.size.length < 2) {
          this.size = [clamped[0], clamped[1]];
        } else {
          this.size[0] = clamped[0];
          this.size[1] = clamped[1];
        }
        this.__smartGridManualSize = [clamped[0], clamped[1]];

        if (this.graph && this.id != null) {
          var managedGroup = findManagingGroupForNode(this.graph, this.id);
          if (managedGroup) {
            var location = findManagedNodeLocation(managedGroup, this.id);
            if (location) {
              var managedState = ensureGroupState(managedGroup);
              var managedRow = managedState.rows[location.rowIndex];
              if (managedRow) {
                var requiredRowHeight = getRowRequiredHeightPx(managedGroup, location.rowIndex);
                var currentRowHeight = Math.max(MIN_ROW_HEIGHT, Number(managedRow.heightPx) || MIN_ROW_HEIGHT);
                if (requiredRowHeight > currentRowHeight) {
                  managedRow.__manualHeightPx = requiredRowHeight;
                  managedRow.heightPx = requiredRowHeight;
                }
              }
            }
            queueGroupRelayout(managedGroup, false);
          }
        }
      }
      if (originalOnResize) {
        return originalOnResize.apply(this, arguments);
      }
      return undefined;
    };
    node.__smartGridResizeHooked = true;
  }

  function rowHasAnyNodes(row) {
    if (!row || !Array.isArray(row.columns)) {
      return false;
    }
    for (var c = 0; c < row.columns.length; c += 1) {
      if (Array.isArray(row.columns[c].childNodeIds) && row.columns[c].childNodeIds.length > 0) {
        return true;
      }
    }
    return false;
  }

  function removeRowIfEmpty(group, rowIndex) {
    var state = ensureGroupState(group);
    if (!state || !Array.isArray(state.rows) || state.rows.length <= 1) {
      return false;
    }
    var index = clamp(rowIndex, 0, state.rows.length - 1);
    var row = state.rows[index];
    if (!row || rowHasAnyNodes(row)) {
      return false;
    }
    state.rows.splice(index, 1);
    group.__smartGridPreserveHeightsOnNextLayout = true;
    updateLayout(group, true);
    group.setDirtyCanvas(true, true);
    return true;
  }

  function pruneTrailingEmptyRows(state) {
    if (!state || !Array.isArray(state.rows)) {
      return false;
    }
    var changed = false;
    while (state.rows.length > 1) {
      var tail = state.rows[state.rows.length - 1];
      if (!tail || rowHasAnyNodes(tail)) {
        break;
      }
      state.rows.pop();
      changed = true;
    }
    return changed;
  }

  function snapshotNodePositions(graph) {
    var positions = {};
    if (!graph || !Array.isArray(graph._nodes)) {
      return positions;
    }
    for (var i = 0; i < graph._nodes.length; i += 1) {
      var node = graph._nodes[i];
      if (!node || node.id == null || !node.pos) {
        continue;
      }
      positions[node.id] = [node.pos[0], node.pos[1]];
    }
    return positions;
  }

  function restoreSnapshotExcept(graph, snapshot, excludeId) {
    if (!graph || !snapshot || !Array.isArray(graph._nodes)) {
      return;
    }
    for (var i = 0; i < graph._nodes.length; i += 1) {
      var node = graph._nodes[i];
      if (!node || node.id == null || node.id === excludeId || !node.pos) {
        continue;
      }
      var saved = snapshot[node.id];
      if (!saved || saved.length < 2) {
        continue;
      }
      node.pos[0] = saved[0];
      node.pos[1] = saved[1];
    }
  }

  function updateLayout(group, shouldPush) {
    if (!group || !group.__isSmartGrid) {
      return;
    }
    if (group.__smartGridUpdatingLayout) {
      return;
    }
    group.__smartGridUpdatingLayout = true;
    var state = ensureGroupState(group);
    var preserveRowHeights = !!group.__smartGridPreserveHeightsOnNextLayout;
    try {
      var oldHeight = group.size[1];
      var oldBottom = group.pos[1] + oldHeight;
      if (isGroupCollapsed(group)) {
        var collapsedWidth = computeCollapsedGroupWidth(group, getAnyGraphCanvas(group.graph));
        var collapsedHeight = COLLAPSED_GROUP_HEIGHT;
        group.size[0] = collapsedWidth;
        group.size[1] = collapsedHeight;
        var collapsedDeltaY = collapsedHeight - oldHeight;
        if (shouldPush && collapsedDeltaY !== 0) {
          pushItemsBelow(group, collapsedDeltaY, oldBottom);
        }
        return;
      }
      var metrics = getGroupInnerMetrics(group);
      var requiredInnerWidth = 0;

      // Step A/B: read child requirements first, per column.
      for (var r = 0; r < state.rows.length; r += 1) {
        var rowForWidth = state.rows[r];
        normalizeRowFlexPercents(rowForWidth);
        var rowRequiredTotal = 0;
        for (var c = 0; c < rowForWidth.columns.length; c += 1) {
          rowRequiredTotal += getColumnMinWidthPx(group, r, c);
        }
        if (rowRequiredTotal > requiredInnerWidth) {
          requiredInnerWidth = rowRequiredTotal;
        }
      }

      // Step C: expand container when child minimums exceed current width.
      var hardMinGroupWidth = Math.max(
        getGroupMinWidthPx(group),
        Math.ceil(requiredInnerWidth + ROW_PADDING * 2)
      );
      if (group.size[0] < hardMinGroupWidth) {
        group.size[0] = hardMinGroupWidth;
        metrics = getGroupInnerMetrics(group);
      }

      // Resolve row physical widths using min-width floors + flex free space.
      for (var rb = 0; rb < state.rows.length; rb += 1) {
        var widthRow = state.rows[rb];
        var minWidths = [];
        for (var mc = 0; mc < widthRow.columns.length; mc += 1) {
          minWidths.push(getColumnMinWidthPx(group, rb, mc));
        }
        resolveRowColumnWidthsPx(metrics.width, widthRow, minWidths);
      }

      var geometry = getGridGeometry(group);
      var rows = geometry.rows;
      var contentBottom = group.pos[1] + HEADER_HEIGHT;

      // Pass 1: use only persisted/manual row heights (no auto vertical resize from content).
      for (var rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        var rowState = state.rows[rowIndex];
        normalizeRowFlexPercents(rowState);
        var baseHeight = Math.max(MIN_ROW_HEIGHT, Number(rowState.heightPx) || MIN_ROW_HEIGHT);
        if (isFinite(Number(rowState.__manualHeightPx))) {
          baseHeight = Math.max(baseHeight, Number(rowState.__manualHeightPx));
        }
        // Always enforce content-fit minimum so padding/gap updates reflect immediately.
        var requiredHeight = getRowRequiredHeightPx(group, rowIndex);
        baseHeight = Math.max(baseHeight, requiredHeight);
        if (preserveRowHeights) {
          baseHeight = Math.max(MIN_ROW_HEIGHT, Number(rowState.heightPx) || MIN_ROW_HEIGHT);
        }
        rowState.heightPx = baseHeight;
        contentBottom += rowState.heightPx;
      }

      // Lock container height before placement so row geometry uses stable pixel heights.
      var desiredHeight = Math.max(80, Math.round((contentBottom - group.pos[1]) + ROW_PADDING * 0.5));
      group.size[1] = desiredHeight;

      // Row heights changed; refresh geometry before placement.
      geometry = getGridGeometry(group);
      rows = geometry.rows;

      // Pass 2: place nodes and stretch cell height (single-node columns stretch to row height).
      for (var rowIndex2 = 0; rowIndex2 < rows.length; rowIndex2 += 1) {
        var rowRect = rows[rowIndex2];
        var rowState2 = state.rows[rowIndex2];
        var rowHeightTarget = Math.max(24, rowRect.height - ROW_NODE_TOP_PADDING - ROW_NODE_BOTTOM_PADDING);

        for (var colIndex = 0; colIndex < rowRect.columns.length; colIndex += 1) {
          var colRect = rowRect.columns[colIndex];
          var column = rowState2.columns[colIndex];
          var y = rowRect.y + ROW_NODE_TOP_PADDING;
          var insets = getColumnHorizontalInsets(rowRect.columns.length, colIndex);
          var keptNodeIds = [];
          var nodeIds = Array.isArray(column.childNodeIds) ? column.childNodeIds.slice() : [];
          var shouldStretchColumn = nodeIds.length <= 1;

          for (var n = 0; n < nodeIds.length; n += 1) {
            var node = getNodeById(group.graph, nodeIds[n]);
            if (!node) {
              continue;
            }
            keptNodeIds.push(node.id);
            node.__smartGridManaged = true;
            ensureManagedNodeResizeHook(node);

            var minSize = getNodeIntrinsicMinSize(node);
            var minNodeWidth = Math.max(0, Number(minSize[0]) || 0);
            var minNodeHeight = Math.max(0, Number(minSize[1]) || 0);
            var availableNodeWidth = Math.max(40, Math.round(colRect.width - insets.total));
            var manualSize = node.__smartGridManualSize && node.__smartGridManualSize.length >= 2
              ? node.__smartGridManualSize
              : null;
            var manualHeight = manualSize ? Math.max(0, Number(manualSize[1]) || 0) : 0;
            var currentHeight = node.size && node.size.length >= 2 ? Number(node.size[1]) || 0 : 0;
            var currentWidth = node.size && node.size.length >= 1 ? Number(node.size[0]) || 0 : 0;
            // Width is always column-driven for managed nodes.
            var targetNodeWidth = Math.max(availableNodeWidth, minNodeWidth);
            var targetNodeHeightBase = Math.max(minNodeHeight, manualHeight);
            // Keep node height stable unless explicitly resized or clamped by node minimum.
            var targetNodeHeight = targetNodeHeightBase;

            if (
              !node.size ||
              node.size.length < 2 ||
              Math.abs(currentWidth - targetNodeWidth) > 0.5 ||
              Math.abs(currentHeight - targetNodeHeight) > 0.5
            ) {
              if (typeof node.setSize === "function") {
                node.__smartGridLayoutSizing = true;
                try {
                  node.setSize([targetNodeWidth, targetNodeHeight]);
                } finally {
                  node.__smartGridLayoutSizing = false;
                }
              } else {
                node.size = [targetNodeWidth, targetNodeHeight];
              }
            }

            node.pos[0] = Math.round(colRect.x + insets.left);
            node.pos[1] = Math.round(y);
            y += (node.size ? node.size[1] : targetNodeHeight || 60) + NODE_VERTICAL_GAP;
            node.__smartGridLastMinSize = [minNodeWidth, minNodeHeight];
          }
          column.childNodeIds = keptNodeIds;
        }
      }

      var newHeight = desiredHeight;
      group.size[1] = newHeight;

      var deltaY = newHeight - oldHeight;
      if (shouldPush && deltaY !== 0) {
        pushItemsBelow(group, deltaY, oldBottom);
      }
    } finally {
      group.__smartGridLastLayoutSize = [group.size[0], group.size[1]];
      syncSmartGridGroupChildren(group);
      group.__smartGridPreserveHeightsOnNextLayout = false;
      group.__smartGridUpdatingLayout = false;
    }
  }

  function snapshotManagedNodePositions(group) {
    var out = {};
    var nodes = getManagedNodeRefs(group);
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      if (!node || node.id == null || !node.pos) {
        continue;
      }
      out[node.id] = [node.pos[0], node.pos[1]];
    }
    return out;
  }

  function syncManagedNodesWithGroupDrag(canvas) {
    if (!canvas) {
      return;
    }
    var drag = canvas.__smartGridManagedMoveDrag;
    if (!drag || !drag.group || !drag.group.__isSmartGrid) {
      return;
    }
    var group = drag.group;
    if (canvas.selected_group !== group || canvas.selected_group_resizing || canvas.node_dragged || canvas.resizing_node) {
      canvas.__smartGridManagedMoveDrag = null;
      return;
    }
    if (!group.pos || group.pos.length < 2) {
      return;
    }
    var gx = Number(group.pos[0]) || 0;
    var gy = Number(group.pos[1]) || 0;
    var dx = gx - (Number(drag.lastGroupPos[0]) || 0);
    var dy = gy - (Number(drag.lastGroupPos[1]) || 0);
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
      return;
    }

    var nodes = getManagedNodeRefs(group);
    var prev = drag.lastNodePositions || {};
    var movedLikeGroup = 0;
    var compared = 0;
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      if (!node || node.id == null || !node.pos || !prev[node.id]) {
        continue;
      }
      compared += 1;
      var ndx = (Number(node.pos[0]) || 0) - (Number(prev[node.id][0]) || 0);
      var ndy = (Number(node.pos[1]) || 0) - (Number(prev[node.id][1]) || 0);
      if (Math.abs(ndx - dx) <= 0.5 && Math.abs(ndy - dy) <= 0.5) {
        movedLikeGroup += 1;
      }
    }

    // Fallback for runtimes where group drags do not propagate to children.
    if (!(compared > 0 && movedLikeGroup === compared)) {
      for (var n = 0; n < nodes.length; n += 1) {
        var child = nodes[n];
        if (!child || !child.pos) {
          continue;
        }
        child.pos[0] += dx;
        child.pos[1] += dy;
      }
    }

    drag.lastGroupPos = [gx, gy];
    drag.lastNodePositions = snapshotManagedNodePositions(group);
  }

  function refreshManagedMoveBaseline(canvas) {
    if (!canvas || !canvas.__smartGridManagedMoveDrag) {
      return;
    }
    var drag = canvas.__smartGridManagedMoveDrag;
    var group = drag.group;
    if (!group || !group.pos || group.pos.length < 2) {
      return;
    }
    drag.lastGroupPos = [group.pos[0], group.pos[1]];
    drag.lastNodePositions = snapshotManagedNodePositions(group);
  }

  function hasSmartGridExternalResize(group) {
    if (!group || !group.size || group.size.length < 2) {
      return false;
    }
    var last = group.__smartGridLastLayoutSize;
    if (!last || last.length < 2) {
      return true;
    }
    return (
      Math.abs((Number(group.size[0]) || 0) - (Number(last[0]) || 0)) > 0.5 ||
      Math.abs((Number(group.size[1]) || 0) - (Number(last[1]) || 0)) > 0.5
    );
  }

  function enforceSmartGridMinBounds(group, canvas) {
    if (!group || !group.__isSmartGrid || !group.size || group.size.length < 2) {
      return false;
    }
    var nextWidth = group.size[0];
    var nextHeight = group.size[1];

    if (isGroupCollapsed(group)) {
      nextWidth = computeCollapsedGroupWidth(group, canvas || getAnyGraphCanvas(group.graph));
      nextHeight = COLLAPSED_GROUP_HEIGHT;
    } else {
      // Lock vertical size to layout-owned height; external drag-based height changes are not allowed.
      var layoutLockedHeight = null;
      if (
        group.__smartGridLastLayoutSize &&
        Array.isArray(group.__smartGridLastLayoutSize) &&
        group.__smartGridLastLayoutSize.length >= 2
      ) {
        layoutLockedHeight = Number(group.__smartGridLastLayoutSize[1]) || null;
      }
      nextWidth = Math.max(getGroupMinWidthPx(group), Number(group.size[0]) || 0);
      if (layoutLockedHeight != null && !group.__smartGridUpdatingLayout) {
        nextHeight = Math.max(getGroupMinHeightPx(group), layoutLockedHeight);
      } else {
        nextHeight = Math.max(getGroupMinHeightPx(group), Number(group.size[1]) || 0);
      }
    }

    if (Math.abs(nextWidth - group.size[0]) <= 0.5 && Math.abs(nextHeight - group.size[1]) <= 0.5) {
      return false;
    }

    group.size[0] = nextWidth;
    group.size[1] = nextHeight;
    if (!group.__smartGridUpdatingLayout) {
      updateLayout(group, false);
    }
    return true;
  }

  function enforceAllSmartGridBounds(canvas) {
    if (!canvas || !canvas.graph || !Array.isArray(canvas.graph._groups)) {
      return false;
    }
    var changed = false;
    for (var i = 0; i < canvas.graph._groups.length; i += 1) {
      var group = canvas.graph._groups[i];
      if (!group || !group.__isSmartGrid) {
        continue;
      }
      if (enforceSmartGridMinBounds(group, canvas)) {
        changed = true;
      }
    }
    return changed;
  }

  function drawSmartGridButton(ctx, rect, label, isHovered) {
    if (!rect) {
      return;
    }
    ctx.save();
    ctx.fillStyle = isHovered ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.14)";
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = "11px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, rect.x + rect.width * 0.5, rect.y + rect.height * 0.5);
    ctx.restore();
  }

  function drawCollapsedProxyMarkers(canvas, ctx, group) {
    if (!canvas || !ctx || !group || !group.__isSmartGrid || !isGroupCollapsed(group)) {
      return;
    }
    var proxyState = canvas.__smartGridProxyState || null;
    var meta = findGroupMetaForProxy(proxyState, group);
    if (!meta) {
      return;
    }
    ctx.save();
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "10px Arial";
    ctx.textBaseline = "middle";

    function drawSide(anchors, counts, alignLeft) {
      for (var type in anchors) {
        if (!Object.prototype.hasOwnProperty.call(anchors, type)) {
          continue;
        }
        var p = anchors[type];
        var count = counts[type] || 0;
        ctx.beginPath();
        ctx.arc(p[0], p[1], 3, 0, Math.PI * 2);
        ctx.fill();
        var label = String(type) + " x" + count;
        ctx.textAlign = alignLeft ? "left" : "right";
        ctx.fillText(label, p[0] + (alignLeft ? 8 : -8), p[1]);
      }
    }

    drawSide(meta.inboundAnchors, meta.inboundCounts, true);
    drawSide(meta.outboundAnchors, meta.outboundCounts, false);
    ctx.restore();
  }

  function drawSmartGridOverlay(canvas, ctx, group) {
    if (!group || !group.__isSmartGrid) {
      return;
    }
    var collapsed = isGroupCollapsed(group);
    var geometry = collapsed ? null : getGridGeometry(group);
    var hover = canvas.__smartGridHover;

    ctx.save();
    ctx.strokeStyle = buildRgba(GRID_LINE_COLOR, GRID_LINE_ALPHA);
    ctx.lineWidth = GRID_LINE_WIDTH;
    if (GRID_LINE_STYLE === "dashed") {
      ctx.setLineDash([10, 6]);
    } else if (GRID_LINE_STYLE === "dotted") {
      ctx.setLineDash([2, 6]);
    } else {
      ctx.setLineDash([]);
    }

    function strokeHorizontalLine(x1, y, x2) {
      if (GRID_LINE_STYLE !== "double") {
        ctx.beginPath();
        ctx.moveTo(x1, y + 0.5);
        ctx.lineTo(x2, y + 0.5);
        ctx.stroke();
        return;
      }
      var offset = Math.max(1.5, GRID_LINE_WIDTH);
      ctx.beginPath();
      ctx.moveTo(x1, y - offset);
      ctx.lineTo(x2, y - offset);
      ctx.moveTo(x1, y + offset);
      ctx.lineTo(x2, y + offset);
      ctx.stroke();
    }

    function strokeVerticalLine(x, y1, y2) {
      if (GRID_LINE_STYLE !== "double") {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, y1);
        ctx.lineTo(x + 0.5, y2);
        ctx.stroke();
        return;
      }
      var offset = Math.max(1.5, GRID_LINE_WIDTH);
      ctx.beginPath();
      ctx.moveTo(x - offset, y1);
      ctx.lineTo(x - offset, y2);
      ctx.moveTo(x + offset, y1);
      ctx.lineTo(x + offset, y2);
      ctx.stroke();
    }

    if (!collapsed && geometry) {
      for (var r = 0; r < geometry.rows.length; r += 1) {
        var row = geometry.rows[r];
        if (r > 0) {
          strokeHorizontalLine(row.x, row.y, row.x + row.width);
        }

        for (var c = 0; c < row.columns.length; c += 1) {
          var col = row.columns[c];
          if (
            hover &&
            hover.group === group &&
            hover.rowIndex === r &&
            hover.colIndex === c
          ) {
            ctx.fillStyle = "rgba(255,255,255,0.1)";
            ctx.fillRect(col.x, col.y, col.width, col.height);
            if (typeof hover.insertLineY === "number") {
              var lineY = clamp(hover.insertLineY, col.y + 4, col.y + col.height - 4);
              ctx.save();
              ctx.strokeStyle = "rgba(255,255,255,0.92)";
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(col.x + 8, lineY + 0.5);
              ctx.lineTo(col.x + col.width - 8, lineY + 0.5);
              ctx.stroke();
              ctx.restore();
            }
          }

          if (c < row.columns.length - 1) {
            var splitX = col.x + col.width;
            var gap = Math.max(0, BORDER_JUNCTION_GAP);
            var startY = row.y + gap;
            var endY = row.y + row.height - gap;
            if (endY <= startY) {
              startY = row.y;
              endY = row.y + row.height;
            }
            strokeVerticalLine(splitX, startY, endY);
          }
        }
      }
    }

    var collapseRect = getCollapseButtonRect(group);
    var collapseHover = !!(
      canvas &&
      canvas.__smartGridCollapseHover &&
      canvas.__smartGridCollapseHover.group === group
    );
    drawSmartGridButton(ctx, collapseRect, collapsed ? "Restore" : "Collapse", collapseHover);

    if (!collapsed) {
      var autofitRect = getAutofitButtonRect(group);
      if (autofitRect) {
        autofitRect.x = collapseRect ? collapseRect.x - AUTOFIT_BUTTON_MARGIN - autofitRect.width : autofitRect.x;
      }
      var autofitHover = !!(
        canvas &&
        canvas.__smartGridAutofitHover &&
        canvas.__smartGridAutofitHover.group === group
      );
      drawSmartGridButton(ctx, autofitRect, "Autofit", autofitHover);
    } else {
      drawCollapsedProxyMarkers(canvas, ctx, group);
    }

    ctx.restore();
  }

  function refreshManagedNodeBounds(group) {
    if (!group || !group.graph || !group.__isSmartGrid) {
      return;
    }
    var state = ensureGroupState(group);
    for (var r = 0; r < state.rows.length; r += 1) {
      var row = state.rows[r];
      for (var c = 0; c < row.columns.length; c += 1) {
        var ids = row.columns[c].childNodeIds || [];
        for (var i = 0; i < ids.length; i += 1) {
          var node = getNodeById(group.graph, ids[i]);
          if (!node) {
            continue;
          }
          var minSize = getNodeIntrinsicMinSize(node);
          var prev = node.__smartGridLastMinSize;
          if (
            !prev ||
            Math.abs((prev[0] || 0) - (minSize[0] || 0)) > 0.5 ||
            Math.abs((prev[1] || 0) - (minSize[1] || 0)) > 0.5
          ) {
            node.__smartGridLastMinSize = [minSize[0], minSize[1]];
            queueGroupRelayout(group, false);
            return;
          }
        }
      }
    }
  }

  function drawCollapsedProxyLinks(canvas, ctx) {
    if (!canvas || !ctx || !canvas.graph || typeof originalRenderLink !== "function") {
      return;
    }
    var proxyState = getCollapsedGroupProxyState(canvas.graph);
    canvas.__smartGridProxyState = proxyState;
  }

  function findDropTargetForNode(canvas, node, dropX, dropY) {
    if (!canvas || !canvas.graph || !node || !node.size) {
      return null;
    }
    var centerX = node.pos[0] + node.size[0] * 0.5;
    var centerY = node.pos[1] + node.size[1] * 0.5;
    var pointX = typeof dropX === "number" ? dropX : centerX;
    var pointY = typeof dropY === "number" ? dropY : centerY;

    var groups = getSmartGroups(canvas.graph);
    for (var i = groups.length - 1; i >= 0; i -= 1) {
      var group = groups[i];
      if (!group.isPointInside(pointX, pointY, 0, true)) {
        continue;
      }
      var hit = findColumnHit(group, pointX, pointY);
      if (hit) {
        var insertion = getColumnInsertionHint(
          group,
          hit.rowIndex,
          hit.colIndex,
          pointY,
          node.id
        );
        hit.insertIndex = insertion.insertIndex;
        hit.insertLineY = insertion.lineY;
        return hit;
      }
    }
    return null;
  }

  function insertRowWithPreset(group, rowIndex, insertAbove, presetWidths) {
    var state = ensureGroupState(group);
    var row = createRowFromPreset(presetWidths);
    var insertAt = insertAbove ? rowIndex : rowIndex + 1;
    insertAt = clamp(insertAt, 0, state.rows.length);
    state.rows.splice(insertAt, 0, row);
    updateLayout(group, true);
    group.setDirtyCanvas(true, true);
  }

  function buildPresetMenu(group, rowIndex, insertAbove) {
    return [
      {
        content: "1 Column (100)",
        callback: function () {
          insertRowWithPreset(group, rowIndex, insertAbove, [100]);
        },
      },
      {
        content: "2 Columns (50/50)",
        callback: function () {
          insertRowWithPreset(group, rowIndex, insertAbove, [50, 50]);
        },
      },
      {
        content: "3 Columns (33/33/33)",
        callback: function () {
          insertRowWithPreset(group, rowIndex, insertAbove, [33.34, 33.33, 33.33]);
        },
      },
    ];
  }

  function getContextRowIndex(canvas, group) {
    var context = canvas && canvas.__smartGridContext;
    if (context && context.group === group && typeof context.canvasY === "number") {
      return findRowIndexAtY(group, context.canvasY);
    }
    return 0;
  }

  function syncHudWithGridSettings() {
    var rowPaddingInput = document.getElementById("smartgrid-row-padding");
    var topPaddingInput = document.getElementById("smartgrid-top-padding");
    var bottomPaddingInput = document.getElementById("smartgrid-bottom-padding");
    var nodeGapInput = document.getElementById("smartgrid-node-gap");
    var borderGapInput = document.getElementById("smartgrid-border-gap");
    var dividerWidthInput = document.getElementById("smartgrid-divider-width");
    var dividerColorInput = document.getElementById("smartgrid-divider-color");
    var dividerStyleInput = document.getElementById("smartgrid-divider-style");
    var edgeGapInput = document.getElementById("smartgrid-edge-gap");
    if (
      !rowPaddingInput ||
      !topPaddingInput ||
      !bottomPaddingInput ||
      !nodeGapInput ||
      !borderGapInput ||
      !dividerWidthInput ||
      !dividerColorInput ||
      !dividerStyleInput ||
      !edgeGapInput
    ) {
      return false;
    }
    rowPaddingInput.value = String(Math.round(gridSettings.rowPadding));
    topPaddingInput.value = String(Math.round(gridSettings.rowTopPadding));
    bottomPaddingInput.value = String(Math.round(gridSettings.rowBottomPadding));
    nodeGapInput.value = String(Math.round(gridSettings.nodeVerticalGap));
    borderGapInput.value = String(Math.round(gridSettings.borderJunctionGap));
    dividerWidthInput.value = String(Math.round(gridSettings.gridLineWidth));
    dividerColorInput.value = normalizeHexColor(gridSettings.gridLineColor, "#ffffff");
    dividerStyleInput.value = normalizeGridLineStyle(gridSettings.gridLineStyle, "solid");
    edgeGapInput.value = String(Math.round(gridSettings.edgeToEdgeSnapGapPx));
    return true;
  }

  function setupHudGridSettingsControls() {
    var rowPaddingInput = document.getElementById("smartgrid-row-padding");
    var topPaddingInput = document.getElementById("smartgrid-top-padding");
    var bottomPaddingInput = document.getElementById("smartgrid-bottom-padding");
    var nodeGapInput = document.getElementById("smartgrid-node-gap");
    var borderGapInput = document.getElementById("smartgrid-border-gap");
    var dividerWidthInput = document.getElementById("smartgrid-divider-width");
    var dividerColorInput = document.getElementById("smartgrid-divider-color");
    var dividerStyleInput = document.getElementById("smartgrid-divider-style");
    var edgeGapInput = document.getElementById("smartgrid-edge-gap");
    if (
      !rowPaddingInput ||
      !topPaddingInput ||
      !bottomPaddingInput ||
      !nodeGapInput ||
      !borderGapInput ||
      !dividerWidthInput ||
      !dividerColorInput ||
      !dividerStyleInput ||
      !edgeGapInput
    ) {
      return false;
    }

    if (rowPaddingInput.__smartGridBound) {
      syncHudWithGridSettings();
      return true;
    }

    function applyFromHud() {
      applyGridSettings({
        rowPadding: rowPaddingInput.value,
        rowTopPadding: topPaddingInput.value,
        rowBottomPadding: bottomPaddingInput.value,
        nodeVerticalGap: nodeGapInput.value,
        borderJunctionGap: borderGapInput.value,
        gridLineWidth: dividerWidthInput.value,
        gridLineColor: dividerColorInput.value,
        gridLineStyle: dividerStyleInput.value,
        edgeToEdgeSnapGapPx: edgeGapInput.value,
      });
      var activeCanvas = window.LGraphCanvas.active_canvas;
      if (activeCanvas && activeCanvas.graph) {
        relayoutAllSmartGroups(activeCanvas.graph);
      } else if (window.__demoGraph) {
        relayoutAllSmartGroups(window.__demoGraph);
      }
      syncHudWithGridSettings();
    }

    rowPaddingInput.addEventListener("input", applyFromHud);
    topPaddingInput.addEventListener("input", applyFromHud);
    bottomPaddingInput.addEventListener("input", applyFromHud);
    nodeGapInput.addEventListener("input", applyFromHud);
    borderGapInput.addEventListener("input", applyFromHud);
    dividerWidthInput.addEventListener("input", applyFromHud);
    dividerColorInput.addEventListener("input", applyFromHud);
    dividerStyleInput.addEventListener("input", applyFromHud);
    edgeGapInput.addEventListener("input", applyFromHud);
    rowPaddingInput.addEventListener("change", applyFromHud);
    topPaddingInput.addEventListener("change", applyFromHud);
    bottomPaddingInput.addEventListener("change", applyFromHud);
    nodeGapInput.addEventListener("change", applyFromHud);
    borderGapInput.addEventListener("change", applyFromHud);
    dividerWidthInput.addEventListener("change", applyFromHud);
    dividerColorInput.addEventListener("change", applyFromHud);
    dividerStyleInput.addEventListener("change", applyFromHud);
    edgeGapInput.addEventListener("change", applyFromHud);
    rowPaddingInput.__smartGridBound = true;
    topPaddingInput.__smartGridBound = true;
    bottomPaddingInput.__smartGridBound = true;
    nodeGapInput.__smartGridBound = true;
    borderGapInput.__smartGridBound = true;
    dividerWidthInput.__smartGridBound = true;
    dividerColorInput.__smartGridBound = true;
    dividerStyleInput.__smartGridBound = true;
    edgeGapInput.__smartGridBound = true;
    syncHudWithGridSettings();
    return true;
  }

  if (!isComfyUIRuntime()) {
    loadGridSettings();
    if (!setupHudGridSettingsControls()) {
      setTimeout(setupHudGridSettingsControls, 0);
      setTimeout(setupHudGridSettingsControls, 150);
    }
  }

  window.LGraphCanvas.onGroupAdd = function (info, entry, mouse_event) {
    if (typeof originalOnGroupAdd === "function") {
      return originalOnGroupAdd.apply(this, arguments);
    }

    var activeCanvas = window.LGraphCanvas.active_canvas;
    if (!activeCanvas) {
      return;
    }
    var group = new window.LiteGraph.LGraphGroup();
    group.pos = resolveCanvasPos(activeCanvas, mouse_event);
    activeCanvas.graph.add(group);
  };

  if (typeof originalGetCanvasMenuOptions === "function") {
    window.LGraphCanvas.prototype.getCanvasMenuOptions = function () {
      var options = originalGetCanvasMenuOptions.apply(this, arguments) || [];
      options.push(null, {
        content: "Add Block Space Grid",
        callback: function (value, menuOptions, event) {
          var canvas = window.LGraphCanvas.active_canvas || this;
          var fallbackEvent = canvas && canvas.__smartGridLastContextEvent ? canvas.__smartGridLastContextEvent : null;
          createSmartGridGroupAtEvent(canvas, event || fallbackEvent);
        },
      });
      return options;
    };
  }


  window.LGraphGroup.prototype.serialize = function () {
    var data = originalGroupSerialize.apply(this, arguments);
    if (this.__isSmartGrid) {
      var state = ensureGroupState(this);
      var rows = [];
      for (var i = 0; i < state.rows.length; i += 1) {
        var row = state.rows[i];
        var columns = [];
        for (var j = 0; j < row.columns.length; j += 1) {
          var col = row.columns[j];
          columns.push({
            id: col.id,
            flexPct: getColumnFlexPct(col),
            widthPct: getColumnFlexPct(col),
            childNodeIds: Array.isArray(col.childNodeIds) ? col.childNodeIds.slice() : [],
          });
        }
        rows.push({
          id: row.id,
          heightPx: row.heightPx,
          columns: columns,
        });
      }
      data.smart_grid = {
        rows: rows,
        collapsed: !!state.collapsed,
        expanded_size: state.expandedSize && state.expandedSize.length >= 2
          ? [state.expandedSize[0], state.expandedSize[1]]
          : null,
      };
    }
    return data;
  };

  window.LGraphGroup.prototype.configure = function (o) {
    originalGroupConfigure.apply(this, arguments);
    if (o && o.smart_grid && Array.isArray(o.smart_grid.rows)) {
      this.__isSmartGrid = true;
      this.__smartGridState = {
        rows: [],
        collapsed: !!o.smart_grid.collapsed,
        expandedSize: (
          o.smart_grid.expanded_size &&
          Array.isArray(o.smart_grid.expanded_size) &&
          o.smart_grid.expanded_size.length >= 2
        )
          ? [o.smart_grid.expanded_size[0], o.smart_grid.expanded_size[1]]
          : null,
      };
      for (var i = 0; i < o.smart_grid.rows.length; i += 1) {
        var inputRow = o.smart_grid.rows[i];
        var row = createRowFromPreset([50, 50]);
        row.id = inputRow.id || row.id;
        row.heightPx = Math.max(MIN_ROW_HEIGHT, Number(inputRow.heightPx) || MIN_ROW_HEIGHT);
        row.columns = [];
        var cols = Array.isArray(inputRow.columns) ? inputRow.columns : [{ flexPct: 100, childNodeIds: [] }];
        for (var j = 0; j < cols.length; j += 1) {
          var col = cols[j];
          var pct = col.flexPct != null ? Number(col.flexPct) : Number(col.widthPct);
          row.columns.push({
            id: col.id || nextId("col"),
            flexPct: pct || 0,
            widthPct: pct || 0,
            childNodeIds: Array.isArray(col.childNodeIds) ? col.childNodeIds.slice() : [],
          });
        }
        normalizeRowFlexPercents(row);
        this.__smartGridState.rows.push(row);
      }
      if (!this.__smartGridState.rows.length) {
        this.__smartGridState.rows.push(createRowFromPreset([50, 50]));
      }
      if (this.__smartGridState.collapsed) {
        this.size[1] = COLLAPSED_GROUP_HEIGHT;
      }
      syncSmartGridGroupChildren(this);
      return;
    }
  };

  if (
    typeof originalGroupRecomputeInsideNodes === "function" &&
    !window.LGraphGroup.prototype.__smartGridRecomputeInsideNodesPatched
  ) {
    window.LGraphGroup.prototype.recomputeInsideNodes = function () {
      if (this && this.__isSmartGrid) {
        syncSmartGridGroupChildren(this);
        return this._nodes;
      }
      return originalGroupRecomputeInsideNodes.apply(this, arguments);
    };
    window.LGraphGroup.prototype.__smartGridRecomputeInsideNodesPatched = true;
  }

  window.LGraphCanvas.prototype.drawGroups = function (canvas, ctx) {
    var swappedTitles = [];
    if (this.graph && Array.isArray(this.graph._groups)) {
      for (var i = 0; i < this.graph._groups.length; i += 1) {
        var drawGroup = this.graph._groups[i];
        if (!drawGroup || !drawGroup.__isSmartGrid || !isGroupCollapsed(drawGroup)) {
          continue;
        }
        swappedTitles.push({
          group: drawGroup,
          title: drawGroup.title,
        });
        drawGroup.title = getCollapsedDisplayTitle(drawGroup);
      }
    }
    try {
      originalDrawGroups.apply(this, arguments);
    } finally {
      for (var s = 0; s < swappedTitles.length; s += 1) {
        swappedTitles[s].group.title = swappedTitles[s].title;
      }
    }
    drawCollapsedProxyLinks(this, ctx);
    if (!this.graph || !Array.isArray(this.graph._groups)) {
      return;
    }
    for (var i = 0; i < this.graph._groups.length; i += 1) {
      var group = this.graph._groups[i];
      if (!group || !group.__isSmartGrid) {
        continue;
      }
      enforceSmartGridMinBounds(group, this);
      if (hasSmartGridExternalResize(group)) {
        updateLayout(group, false);
      }
      if (!isGroupCollapsed(group)) {
        refreshManagedNodeBounds(group);
      }
      drawSmartGridOverlay(this, ctx, group);
    }
    drawAlignmentGuides(this, ctx);
  };

  window.LGraphCanvas.prototype.getGroupMenuOptions = function (group) {
    var options = originalGetGroupMenuOptions.apply(this, arguments) || [];
    if (!group || !group.__isSmartGrid) {
      return options;
    }

    var collapsed = isGroupCollapsed(group);

    var rowIndex = getContextRowIndex(this, group);
    var state = ensureGroupState(group);
    var candidateRow = state.rows[rowIndex];
    var canRemoveRow = !!candidateRow && !rowHasAnyNodes(candidateRow) && state.rows.length > 1;
    options.push(
      null,
      {
        content: collapsed ? "Restore Group" : "Collapse Group",
        callback: function () {
          toggleGroupCollapsed(group, true);
        },
      }
    );
    if (collapsed) {
      return options;
    }
    options.push(
      {
        content: "Add Row Above",
        has_submenu: true,
        submenu: {
          title: "Row Presets",
          extra: group,
          options: buildPresetMenu(group, rowIndex, true),
        },
      },
      {
        content: "Add Row Below",
        has_submenu: true,
        submenu: {
          title: "Row Presets",
          extra: group,
          options: buildPresetMenu(group, rowIndex, false),
        },
      },
      {
        content: "Remove Row",
        disabled: !canRemoveRow,
        callback: function () {
          removeRowIfEmpty(group, rowIndex);
        },
      }
    );
    return options;
  };

  window.LGraphCanvas.prototype.processContextMenu = function (node, event) {
    if (event) {
      this.__smartGridLastContextEvent = {
        canvasX: event.canvasX,
        canvasY: event.canvasY,
        clientX: event.clientX,
        clientY: event.clientY,
      };
    }
    if (event && this.graph && typeof this.graph.getGroupOnPos === "function") {
      var group = this.graph.getGroupOnPos(event.canvasX, event.canvasY);
      if (group && group.__isSmartGrid) {
        this.__smartGridContext = {
          group: group,
          canvasX: event.canvasX,
          canvasY: event.canvasY,
        };
      } else {
        this.__smartGridContext = null;
      }
    }
    return originalProcessContextMenu.apply(this, arguments);
  };

  window.LGraphCanvas.prototype.processMouseDown = function (event) {
    var isLeftButton = event && (event.button === 0 || event.which === 1);
    // Do not touch non-left clicks so native ComfyUI/LiteGraph context actions stay intact.
    if (!isLeftButton) {
      return originalProcessMouseDown.apply(this, arguments);
    }

    if (event && typeof this.adjustMouseEvent === "function") {
      this.adjustMouseEvent(event);
    }
    this.__smartGridGroupDrag = null;
    clearAlignmentState(this);

    var isDoubleClick = !!(isLeftButton && event && typeof event.detail === "number" && event.detail >= 2);
    var clickedNode = null;
    if (
      isLeftButton &&
      this.graph &&
      typeof this.graph.getNodeOnPos === "function" &&
      typeof event.canvasX === "number" &&
      typeof event.canvasY === "number"
    ) {
      clickedNode = this.graph.getNodeOnPos(event.canvasX, event.canvasY, this.visible_nodes);
    }
    if (isDoubleClick) {
      var dcCollapseHit = findCollapseButtonHit(this, event.canvasX, event.canvasY);
      var dcAutofitHit = findAutofitButtonHit(this, event.canvasX, event.canvasY);
      var dcRowHit = findRowDividerHit(this, event.canvasX, event.canvasY);
      var dcSplitterHit = findSplitterHit(this, event.canvasX, event.canvasY);
      // Preserve native LiteGraph/ComfyUI double-click behavior unless the click is on a SmartGrid control hotspot.
      if (!dcCollapseHit && !dcAutofitHit && !dcRowHit && !dcSplitterHit) {
        return originalProcessMouseDown.apply(this, arguments);
      }
    }
    if (isLeftButton) {
      var collapseHit = findCollapseButtonHit(this, event.canvasX, event.canvasY);
      if (collapseHit && collapseHit.group) {
        toggleGroupCollapsed(collapseHit.group, true);
        this.__smartGridCollapseHover = null;
        this.__smartGridAutofitHover = null;
        this.dirty_canvas = true;
        this.dirty_bgcanvas = true;
        return true;
      }
      var autofitHit = findAutofitButtonHit(this, event.canvasX, event.canvasY);
      if (autofitHit && autofitHit.group && !isGroupCollapsed(autofitHit.group)) {
        autofitSmartGridRows(autofitHit.group);
        this.__smartGridAutofitHover = null;
        this.dirty_canvas = true;
        this.dirty_bgcanvas = true;
        return true;
      }
      var rowHit = findRowDividerHit(this, event.canvasX, event.canvasY);
      if (rowHit) {
        this.__smartGridRowDividerDrag = {
          group: rowHit.group,
          upperIndex: rowHit.upperIndex,
          lowerIndex: rowHit.lowerIndex,
          previousSelectedGroup: this.selected_group || null,
        };
        this.selected_group_resizing = false;
        this.dirty_canvas = true;
        this.dirty_bgcanvas = true;
        return true;
      }
      var hit = findSplitterHit(this, event.canvasX, event.canvasY);
      if (hit) {
        this.__smartGridSplitterDrag = {
          group: hit.group,
          rowIndex: hit.rowIndex,
          leftIndex: hit.leftIndex,
          rightIndex: hit.rightIndex,
          previousSelectedGroup: this.selected_group || null,
        };
        this.selected_group_resizing = false;
        this.dirty_canvas = true;
        this.dirty_bgcanvas = true;
        return true;
      }
    }

    var result = originalProcessMouseDown.apply(this, arguments);
    this.__smartGridGroupDrag = null;
    if (
      isLeftButton &&
      this.selected_group &&
      this.selected_group.__isSmartGrid &&
      !this.selected_group_resizing &&
      !this.node_dragged &&
      !this.resizing_node
    ) {
      this.__smartGridGroupDrag = {
        group: this.selected_group,
      };
      this.__smartGridManagedMoveDrag = {
        group: this.selected_group,
        lastGroupPos: [this.selected_group.pos[0], this.selected_group.pos[1]],
        lastNodePositions: snapshotManagedNodePositions(this.selected_group),
      };
    }
    if (isLeftButton && this.selected_group && this.selected_group.__isSmartGrid) {
      syncSmartGridGroupChildren(this.selected_group);
    }
    if (
      isLeftButton &&
      this.resizing_node &&
      this.resizing_node.__smartGridManaged &&
      isManagedNodeResizeLocked(this.resizing_node)
    ) {
      // If SmartGrid constraints collapse min/max, block resize handle interaction.
      this.resizing_node = null;
    }
    if (
      isLeftButton &&
      this.selected_group_resizing &&
      this.selected_group &&
      this.selected_group.__isSmartGrid
    ) {
      if (isGroupCollapsed(this.selected_group)) {
        this.selected_group.size[0] = computeCollapsedGroupWidth(this.selected_group, this);
        this.selected_group.size[1] = COLLAPSED_GROUP_HEIGHT;
        this.selected_group_resizing = false;
        this.selected_group.__smartGridResizeStartHeight = 0;
        this.selected_group.__smartGridResizeStartBottomRowHeight = 0;
        this.dirty_canvas = true;
        this.dirty_bgcanvas = true;
        return result;
      }
      this.selected_group.__smartGridResizeStartHeight = this.selected_group.size
        ? this.selected_group.size[1]
        : 0;
      this.selected_group.__smartGridResizeLockedHeight = this.selected_group.__smartGridResizeStartHeight;
      var resizeState = ensureGroupState(this.selected_group);
      var bottomIndex = resizeState.rows.length - 1;
      if (bottomIndex >= 0) {
        var bottomRow = resizeState.rows[bottomIndex];
        var bottomHeight = Math.max(MIN_ROW_HEIGHT, Number(bottomRow.heightPx) || MIN_ROW_HEIGHT);
        this.selected_group.__smartGridResizeStartBottomRowHeight = bottomHeight;
      } else {
        this.selected_group.__smartGridResizeStartBottomRowHeight = 0;
      }
    }
    if (isLeftButton && clickedNode && clickedNode.id != null) {
      this.__smartGridNodeDragSnapshot = {
        primaryNodeId: clickedNode.id,
        positions: snapshotNodePositions(this.graph),
      };
    } else if (isLeftButton && this.node_dragged && this.node_dragged.id != null) {
      this.__smartGridNodeDragSnapshot = {
        primaryNodeId: this.node_dragged.id,
        positions: snapshotNodePositions(this.graph),
      };
    } else if (isLeftButton) {
      this.__smartGridNodeDragSnapshot = {
        primaryNodeId: this.node_over && this.node_over.id != null ? this.node_over.id : null,
        positions: snapshotNodePositions(this.graph),
      };
    } else {
      this.__smartGridNodeDragSnapshot = null;
    }
    return result;
  };

  window.LGraphCanvas.prototype.processMouseMove = function (event) {
    if (event && typeof this.adjustMouseEvent === "function") {
      this.adjustMouseEvent(event);
    }

    var rowDividerDrag = this.__smartGridRowDividerDrag;
    if (rowDividerDrag) {
      var rowGroup = rowDividerDrag.group;
      if (!rowGroup || !rowGroup.__isSmartGrid) {
        this.__smartGridRowDividerDrag = null;
        return true;
      }

      var rowState = ensureGroupState(rowGroup);
      var upperRow = rowState.rows[rowDividerDrag.upperIndex];
      if (!upperRow) {
        this.__smartGridRowDividerDrag = null;
        return true;
      }

      var rowGeometry = getGridGeometry(rowGroup);
      var upperRect = rowGeometry.rows[rowDividerDrag.upperIndex];
      if (!upperRect) {
        return true;
      }

      var pairTop = upperRect.y;
      var minUpper = getRowRequiredHeightPx(rowGroup, rowDividerDrag.upperIndex);
      var rawUpper = event.canvasY - pairTop;
      var snappedUpper = roundToSnapPixels(rawUpper);
      var nextUpper = Math.max(minUpper, snappedUpper);

      // Inner horizontal divider controls the row above it.
      upperRow.__manualHeightPx = nextUpper;
      upperRow.heightPx = nextUpper;

      updateLayout(rowGroup, false);
      this.dirty_canvas = true;
      this.dirty_bgcanvas = true;
      if (this.canvas && this.canvas.style) {
        this.canvas.style.cursor = "row-resize";
      }
      return true;
    }

    var splitterDrag = this.__smartGridSplitterDrag;
    if (splitterDrag) {
      var group = splitterDrag.group;
      if (!group || !group.__isSmartGrid) {
        this.__smartGridSplitterDrag = null;
        return true;
      }

      var state = ensureGroupState(group);
      var row = state.rows[splitterDrag.rowIndex];
      if (!row) {
        this.__smartGridSplitterDrag = null;
        return true;
      }
      normalizeRowFlexPercents(row);

      var geometry = getGridGeometry(group);
      var rowRect = geometry.rows[splitterDrag.rowIndex];
      if (!rowRect) {
        return true;
      }

      var minWidths = [];
      for (var i = 0; i < row.columns.length; i += 1) {
        minWidths.push(getColumnMinWidthPx(group, splitterDrag.rowIndex, i));
      }
      var resolved = resolveRowColumnWidthsPx(rowRect.width, row, minWidths);

      var leftStartX = rowRect.columns[splitterDrag.leftIndex].x;
      var pairStartX = leftStartX;
      var leftCurrent = resolved[splitterDrag.leftIndex];
      var rightCurrent = resolved[splitterDrag.rightIndex];
      var pairWidth = leftCurrent + rightCurrent;

      var rawLeftPx = event.canvasX - pairStartX;

      var minLeftPx = getColumnMinWidthPx(group, splitterDrag.rowIndex, splitterDrag.leftIndex);
      var minRightPx = getColumnMinWidthPx(group, splitterDrag.rowIndex, splitterDrag.rightIndex);
      var minLeftBound = minLeftPx;
      var maxLeftBound = pairWidth - minRightPx;
      var clampedLeftPx = clamp(rawLeftPx, minLeftBound, maxLeftBound);
      var clampedRightPx = pairWidth - clampedLeftPx;

      var leftFree = Math.max(0, clampedLeftPx - minLeftPx);
      var rightFree = Math.max(0, clampedRightPx - minRightPx);
      var pairFree = leftFree + rightFree;

      var pairFlexPct =
        getColumnFlexPct(row.columns[splitterDrag.leftIndex]) +
        getColumnFlexPct(row.columns[splitterDrag.rightIndex]);
      if (pairFree <= 0) {
        row.columns[splitterDrag.leftIndex].flexPct = pairFlexPct * 0.5;
        row.columns[splitterDrag.rightIndex].flexPct = pairFlexPct * 0.5;
      } else {
        var leftSharePct = roundToSnapPercent((leftFree / pairFree) * pairFlexPct);
        leftSharePct = clamp(leftSharePct, 0, pairFlexPct);
        row.columns[splitterDrag.leftIndex].flexPct = leftSharePct;
        row.columns[splitterDrag.rightIndex].flexPct = pairFlexPct - leftSharePct;
      }

      normalizeRowFlexPercents(row);

      updateLayout(group, false);
      this.dirty_canvas = true;
      this.dirty_bgcanvas = true;
      if (this.canvas && this.canvas.style) {
        this.canvas.style.cursor = "col-resize";
      }
      return true;
    }

    var result = originalProcessMouseMove.apply(this, arguments);
    if (
      this.resizing_node &&
      this.resizing_node.__smartGridManaged &&
      isManagedNodeResizeLocked(this.resizing_node)
    ) {
      this.resizing_node = null;
    }
    // Keep SmartGrid children responsive while the group bounding box is resized.
    if (this.selected_group_resizing && this.selected_group && this.selected_group.__isSmartGrid) {
      if (isGroupCollapsed(this.selected_group)) {
        this.selected_group.size[0] = computeCollapsedGroupWidth(this.selected_group, this);
        this.selected_group.size[1] = COLLAPSED_GROUP_HEIGHT;
        this.selected_group_resizing = false;
        this.dirty_canvas = true;
        this.dirty_bgcanvas = true;
        return result;
      }
      var minResizeWidth = getGroupMinWidthPx(this.selected_group);
      var minResizeHeight = isGroupCollapsed(this.selected_group)
        ? COLLAPSED_GROUP_HEIGHT
        : 80;
      // BSG vertical resizing is disabled; only horizontal group resizing is allowed.
      var lockedHeight = this.selected_group.__smartGridResizeLockedHeight;
      var desiredHeight = isGroupCollapsed(this.selected_group)
        ? COLLAPSED_GROUP_HEIGHT
        : Math.max(minResizeHeight, Number(lockedHeight) || Number(this.selected_group.size[1]) || minResizeHeight);
      var sizing = {
        width: Math.max(minResizeWidth, roundToSnapPixels(this.selected_group.size[0])),
        height: desiredHeight,
        minWidth: minResizeWidth,
        minHeight: minResizeHeight,
        lockHeight: !isGroupCollapsed(this.selected_group),
      };
      sizing = applyGroupResizeAlignmentDuringDrag(this, event, this.selected_group, sizing);
      this.selected_group.size = [sizing.width, sizing.height];
      desiredHeight = sizing.height;
      if (!isGroupCollapsed(this.selected_group)) {
        var resizeGroupState = ensureGroupState(this.selected_group);
        var resizeBottomIndex = resizeGroupState.rows.length - 1;
        if (resizeBottomIndex >= 0) {
          var resizeBottomRow = resizeGroupState.rows[resizeBottomIndex];
          var startGroupHeight = this.selected_group.__smartGridResizeStartHeight || desiredHeight;
          var startBottomHeight = this.selected_group.__smartGridResizeStartBottomRowHeight
            || Math.max(MIN_ROW_HEIGHT, Number(resizeBottomRow.heightPx) || MIN_ROW_HEIGHT);
          var minBottomHeight = getRowRequiredHeightPx(this.selected_group, resizeBottomIndex);
          var bottomDelta = desiredHeight - startGroupHeight;
          var nextBottomHeight = Math.max(minBottomHeight, startBottomHeight + bottomDelta);
          resizeBottomRow.__manualHeightPx = nextBottomHeight;
          resizeBottomRow.heightPx = nextBottomHeight;
        }
      }
      updateLayout(this.selected_group, false);
      this.dirty_canvas = true;
      this.dirty_bgcanvas = true;
    } else if (this.__smartGridAlignmentMode === "resize" && this.__smartGridAlignmentState) {
      clearAlignmentState(this);
      this.dirty_bgcanvas = true;
    }
    syncManagedNodesWithGroupDrag(this);
    applyGroupAlignmentDuringDrag(this, event);
    refreshManagedMoveBaseline(this);

    var isBusyDragging =
      !!this.node_dragged || !!this.resizing_node || !!this.dragging_canvas || !!this.dragging_rectangle;
    if (!isBusyDragging && event && typeof event.canvasX === "number" && typeof event.canvasY === "number") {
      var collapseHoverHit = findCollapseButtonHit(this, event.canvasX, event.canvasY);
      var autofitHoverHit = findAutofitButtonHit(this, event.canvasX, event.canvasY);
      var rowDividerHoverHit = findRowDividerHit(this, event.canvasX, event.canvasY);
      var splitterHoverHit = findSplitterHit(this, event.canvasX, event.canvasY);
      if (collapseHoverHit && this.canvas && this.canvas.style) {
        this.__smartGridCollapseHover = collapseHoverHit;
        this.__smartGridAutofitHover = null;
        this.canvas.style.cursor = "pointer";
      } else if (
        autofitHoverHit &&
        !isGroupCollapsed(autofitHoverHit.group) &&
        this.canvas &&
        this.canvas.style
      ) {
        this.__smartGridCollapseHover = null;
        this.__smartGridAutofitHover = autofitHoverHit;
        this.canvas.style.cursor = "pointer";
      } else if (rowDividerHoverHit && this.canvas && this.canvas.style) {
        this.__smartGridCollapseHover = null;
        this.__smartGridAutofitHover = null;
        this.canvas.style.cursor = "row-resize";
      } else if (splitterHoverHit && this.canvas && this.canvas.style) {
        this.__smartGridCollapseHover = null;
        this.__smartGridAutofitHover = null;
        this.canvas.style.cursor = "col-resize";
      } else if (
        this.canvas &&
        this.canvas.style &&
        (this.canvas.style.cursor === "col-resize" ||
          this.canvas.style.cursor === "row-resize" ||
          this.canvas.style.cursor === "pointer")
      ) {
        this.__smartGridCollapseHover = null;
        this.__smartGridAutofitHover = null;
        this.canvas.style.cursor = "";
      } else {
        this.__smartGridCollapseHover = null;
        this.__smartGridAutofitHover = null;
      }
    }

    // Fallback: if drag started after mousedown and we missed initial capture, snapshot now.
    if (
      this.node_dragged &&
      this.node_dragged.id != null &&
      (!this.__smartGridNodeDragSnapshot ||
        this.__smartGridNodeDragSnapshot.primaryNodeId !== this.node_dragged.id)
    ) {
      this.__smartGridNodeDragSnapshot = {
        primaryNodeId: this.node_dragged.id,
        positions: snapshotNodePositions(this.graph),
      };
    }

    if (this.node_dragged) {
      this.__smartGridLastDraggedNode = this.node_dragged;
      var hover = findDropTargetForNode(this, this.node_dragged);
      if (
        hover &&
        (!this.__smartGridHover ||
          this.__smartGridHover.group !== hover.group ||
          this.__smartGridHover.rowIndex !== hover.rowIndex ||
          this.__smartGridHover.colIndex !== hover.colIndex ||
          this.__smartGridHover.insertIndex !== hover.insertIndex)
      ) {
        this.__smartGridHover = hover;
        this.dirty_bgcanvas = true;
      } else if (!hover && this.__smartGridHover) {
        this.__smartGridHover = null;
        this.dirty_bgcanvas = true;
      }
    } else if (this.__smartGridHover) {
      this.__smartGridHover = null;
      this.dirty_bgcanvas = true;
    }

    if (enforceAllSmartGridBounds(this)) {
      this.dirty_canvas = true;
      this.dirty_bgcanvas = true;
    }

    return result;
  };

  window.LGraphCanvas.prototype.processMouseUp = function (event) {
    if (event && typeof this.adjustMouseEvent === "function") {
      this.adjustMouseEvent(event);
    }

    var rowDividerDrag = this.__smartGridRowDividerDrag;
    if (rowDividerDrag) {
      this.__smartGridRowDividerDrag = null;
      clearAlignmentState(this);
      this.__smartGridGroupDrag = null;
      if (rowDividerDrag.group && rowDividerDrag.group.__isSmartGrid) {
        updateLayout(rowDividerDrag.group, false);
      }
      this.selected_group = rowDividerDrag.previousSelectedGroup || null;
      this.selected_group_resizing = false;
      this.dirty_canvas = true;
      this.dirty_bgcanvas = true;
      return true;
    }

    var splitterDrag = this.__smartGridSplitterDrag;
    if (splitterDrag) {
      this.__smartGridSplitterDrag = null;
      clearAlignmentState(this);
      this.__smartGridGroupDrag = null;
      if (splitterDrag.group && splitterDrag.group.__isSmartGrid) {
        updateLayout(splitterDrag.group, true);
      }
      // Avoid leaking group-drag state after splitter interactions.
      this.selected_group = splitterDrag.previousSelectedGroup || null;
      this.selected_group_resizing = false;
      this.dirty_canvas = true;
      this.dirty_bgcanvas = true;
      return true;
    }

    var draggedNode = this.node_dragged || this.__smartGridLastDraggedNode || null;
    if (!draggedNode && this.__smartGridNodeDragSnapshot && this.__smartGridNodeDragSnapshot.primaryNodeId != null) {
      draggedNode = getNodeById(this.graph, this.__smartGridNodeDragSnapshot.primaryNodeId);
    }
    if (!draggedNode && this.node_over && this.node_over.id != null) {
      draggedNode = this.node_over;
    }
    var resizedNode = this.resizing_node || null;
    var resizedGroup = this.selected_group_resizing && this.selected_group && this.selected_group.__isSmartGrid
      ? this.selected_group
      : null;
    var result = originalProcessMouseUp.apply(this, arguments);

    if (resizedGroup) {
      if (isGroupCollapsed(resizedGroup)) {
        resizedGroup.size[0] = computeCollapsedGroupWidth(resizedGroup, this);
        resizedGroup.size[1] = COLLAPSED_GROUP_HEIGHT;
        updateLayout(resizedGroup, false);
        resizedGroup.__smartGridResizeStartHeight = 0;
        resizedGroup.__smartGridResizeStartBottomRowHeight = 0;
        resizedGroup.__smartGridResizeLockedHeight = 0;
      } else {
        var minGroupWidth = getGroupMinWidthPx(resizedGroup);
        var minGroupHeight = isGroupCollapsed(resizedGroup)
          ? COLLAPSED_GROUP_HEIGHT
          : 80;
        var lockedHeight = Number(resizedGroup.__smartGridResizeLockedHeight) || 0;
        if (lockedHeight <= 0 && resizedGroup.__smartGridLastLayoutSize && resizedGroup.__smartGridLastLayoutSize.length >= 2) {
          lockedHeight = Number(resizedGroup.__smartGridLastLayoutSize[1]) || 0;
        }
        var nextHeight = lockedHeight > 0
          ? Math.max(minGroupHeight, roundToSnapPixels(lockedHeight))
          : Math.max(minGroupHeight, roundToSnapPixels(resizedGroup.size[1]));
        resizedGroup.size = [
          Math.max(minGroupWidth, roundToSnapPixels(resizedGroup.size[0])),
          nextHeight,
        ];
        updateLayout(resizedGroup, false);
        resizedGroup.__smartGridResizeStartHeight = 0;
        resizedGroup.__smartGridResizeStartBottomRowHeight = 0;
        resizedGroup.__smartGridResizeLockedHeight = 0;
      }
    }

    if (draggedNode) {
      var dropX = event && typeof event.canvasX === "number" ? event.canvasX : null;
      var dropY = event && typeof event.canvasY === "number" ? event.canvasY : null;
      var hit = findDropTargetForNode(this, draggedNode, dropX, dropY);
      if (hit) {
        var dragSnapshot = this.__smartGridNodeDragSnapshot;
        var targetCol = getColumnByIndex(hit.group, hit.rowIndex, hit.colIndex);
        if (targetCol) {
          if (!Array.isArray(targetCol.childNodeIds)) {
            targetCol.childNodeIds = [];
          }
          var impactedGroups = [];
          var previousGroups = removeNodeFromAllSmartColumns(this.graph, draggedNode.id);
          impactedGroups = impactedGroups.concat(previousGroups);

          // Multi-node stacking: insert into stack at hover-indicated position.
          if (targetCol.childNodeIds.indexOf(draggedNode.id) === -1) {
            var targetInsertIndex = Math.max(
              0,
              Math.min(
                targetCol.childNodeIds.length,
                typeof hit.insertIndex === "number" ? Math.floor(hit.insertIndex) : targetCol.childNodeIds.length
              )
            );
            targetCol.childNodeIds.splice(targetInsertIndex, 0, draggedNode.id);
          }
          addUniqueGroup(impactedGroups, hit.group);
          var targetState = ensureGroupState(hit.group);
          var targetRow = targetState.rows[hit.rowIndex];
          if (targetRow) {
            // Drop-only row recalculation: expand to fit stacked content + paddings, never shrink.
            var requiredRowHeight = getRowRequiredHeightPx(hit.group, hit.rowIndex);
            var currentRowHeight = Math.max(MIN_ROW_HEIGHT, Number(targetRow.heightPx) || MIN_ROW_HEIGHT);
            var nextRowHeight = Math.max(currentRowHeight, requiredRowHeight);
            targetRow.__manualHeightPx = nextRowHeight;
            targetRow.heightPx = nextRowHeight;
          }

          // Dropping into a column should only reflow the grid internals.
          // Avoid pushing unrelated free nodes/groups during ordinary drops.
          if (
            dragSnapshot &&
            dragSnapshot.positions &&
            (dragSnapshot.primaryNodeId == null || dragSnapshot.primaryNodeId === draggedNode.id)
          ) {
            restoreSnapshotExcept(this.graph, dragSnapshot.positions, draggedNode.id);
          }
          for (var pg = 0; pg < impactedGroups.length; pg += 1) {
            if (impactedGroups[pg]) {
              updateLayout(impactedGroups[pg], false);
            }
          }
        }
      } else {
        // If a previously managed node is dropped outside any SmartGrid column,
        // release ownership so later grid reflows do not pull it back in.
        var releasedGroups = removeNodeFromAllSmartColumns(this.graph, draggedNode.id);
        for (var rg = 0; rg < releasedGroups.length; rg += 1) {
          updateLayout(releasedGroups[rg], false);
        }
      }
    }

    if (resizedNode && resizedNode.id != null && this.graph) {
      var groups = getSmartGroups(this.graph);
      for (var g = 0; g < groups.length; g += 1) {
        var state = ensureGroupState(groups[g]);
        var found = false;
        for (var r = 0; r < state.rows.length && !found; r += 1) {
          var row = state.rows[r];
          for (var c = 0; c < row.columns.length; c += 1) {
            if ((row.columns[c].childNodeIds || []).indexOf(resizedNode.id) !== -1) {
              var currentRowHeight = Math.max(MIN_ROW_HEIGHT, Number(row.heightPx) || MIN_ROW_HEIGHT);
              var requiredRowHeight = getRowRequiredHeightPx(groups[g], r);
              if (requiredRowHeight > currentRowHeight) {
                row.__manualHeightPx = requiredRowHeight;
                row.heightPx = requiredRowHeight;
              }
              updateLayout(groups[g], true);
              found = true;
              break;
            }
          }
        }
      }
    }

    if (this.__smartGridHover) {
      this.__smartGridHover = null;
      this.dirty_bgcanvas = true;
    }
    if (this.__smartGridAutofitHover || this.__smartGridCollapseHover) {
      this.__smartGridAutofitHover = null;
      this.__smartGridCollapseHover = null;
      this.dirty_bgcanvas = true;
    }
    clearAlignmentState(this);
    this.__smartGridGroupDrag = null;
    this.__smartGridManagedMoveDrag = null;
    this.__smartGridNodeDragSnapshot = null;
    this.__smartGridLastDraggedNode = null;

    if (enforceAllSmartGridBounds(this)) {
      this.dirty_canvas = true;
      this.dirty_bgcanvas = true;
    }

    return result;
  };

  if (typeof originalRenderLink === "function") {
    window.LGraphCanvas.prototype.renderLink = function (ctx, a, b) {
      var link = extractLinkFromRenderArgs(arguments);
      if (!link || !a || !b || a.length < 2 || b.length < 2) {
        return originalRenderLink.apply(this, arguments);
      }
      var resolved = resolveRenderEndpointsForCollapsedGroups(this, link, a, b);
      if (!resolved) {
        return originalRenderLink.apply(this, arguments);
      }
      if (resolved.hidden) {
        return null;
      }
      var args = Array.prototype.slice.call(arguments);
      args[1] = resolved.start;
      args[2] = resolved.end;
      return originalRenderLink.apply(this, args);
    };
  }

  if (typeof originalDrawNode === "function") {
    window.LGraphCanvas.prototype.drawNode = function (node, ctx) {
      if (node && node.id != null && this && this.graph && isNodeManagedByCollapsedGroup(this.graph, node.id)) {
        return;
      }
      return originalDrawNode.apply(this, arguments);
    };
  }

  if (typeof originalGraphGetNodeOnPos === "function" && !window.LGraph.prototype.__smartGridNodeHitPatched) {
    window.LGraph.prototype.getNodeOnPos = function (x, y, nodes_list, margin) {
      var list = Array.isArray(nodes_list) ? nodes_list : this._nodes;
      if (!Array.isArray(list) || !list.length) {
        return null;
      }
      for (var i = list.length - 1; i >= 0; i -= 1) {
        var node = list[i];
        if (!node || node.constructor === window.LGraphGroup) {
          continue;
        }
        if (node.id != null && isNodeManagedByCollapsedGroup(this, node.id)) {
          continue;
        }
        if (typeof node.isPointInside === "function" && node.isPointInside(x, y, margin, false)) {
          return node;
        }
      }
      return null;
    };
    window.LGraph.prototype.__smartGridNodeHitPatched = true;
  }

  if (typeof originalGraphRemove === "function" && !window.LGraph.prototype.__smartGridRemovePatched) {
    window.LGraph.prototype.remove = function (item) {
      var managedGroup = null;
      var nodeId = null;
      if (item && item.constructor !== window.LGraphGroup && item.id != null) {
        nodeId = item.id;
        managedGroup = findManagingGroupForNode(this, nodeId);
      }
      var result = originalGraphRemove.apply(this, arguments);
      if (managedGroup && nodeId != null) {
        removeNodeFromAllSmartColumns(this, nodeId);
        queueGroupRelayout(managedGroup, true);
      }
      return result;
    };
    window.LGraph.prototype.__smartGridRemovePatched = true;
  }

  if (typeof originalNodeSetSize === "function" && !window.LGraphNode.prototype.__smartGridSetSizePatched) {
    window.LGraphNode.prototype.setSize = function (size) {
      var managedGroup = null;
      var nextSize = size;
      if (this && this.graph && !this.__smartGridLayoutSizing) {
        managedGroup = findManagingGroupForNode(this.graph, this.id);
        if (managedGroup) {
          this.__smartGridManaged = true;
          ensureManagedNodeResizeHook(this);
          if (size && size.length >= 2) {
            var clampedSize = clampManagedNodeSize(this, size[0], size[1]);
            nextSize = [clampedSize[0], clampedSize[1]];
            this.__smartGridManualSize = [clampedSize[0], clampedSize[1]];
          }
        }
      }

      var result = originalNodeSetSize.call(this, nextSize);
      if (!this || !this.graph || this.__smartGridLayoutSizing) {
        return result;
      }
      if (managedGroup) {
        queueGroupRelayout(managedGroup, false);
      }
      return result;
    };
    window.LGraphNode.prototype.__smartGridSetSizePatched = true;
  }

  window.SmartGrid = {
    SNAP_INCREMENT: SNAP_INCREMENT,
    SPLITTER_HITBOX: SPLITTER_HITBOX,
    ROW_PADDING: ROW_PADDING,
    isCollapsed: function (group) {
      return isGroupCollapsed(group);
    },
    setCollapsed: function (group, collapsed) {
      setGroupCollapsed(group, !!collapsed, true);
    },
    toggleCollapsed: function (group) {
      toggleGroupCollapsed(group, true);
    },
    getLayoutSettings: function () {
      return {
        rowPadding: gridSettings.rowPadding,
        rowTopPadding: gridSettings.rowTopPadding,
        rowBottomPadding: gridSettings.rowBottomPadding,
        nodeVerticalGap: gridSettings.nodeVerticalGap,
        borderJunctionGap: gridSettings.borderJunctionGap,
        gridLineWidth: gridSettings.gridLineWidth,
        gridLineColor: gridSettings.gridLineColor,
        gridLineStyle: gridSettings.gridLineStyle,
        gridLineAlpha: gridSettings.gridLineAlpha,
        alignmentHintEnabled: !!gridSettings.alignmentHintEnabled,
        alignmentSnapEnabled: !!gridSettings.alignmentSnapEnabled,
        alignmentThresholdPx: gridSettings.alignmentThresholdPx,
        edgeToEdgeSnapGapPx: gridSettings.edgeToEdgeSnapGapPx,
      };
    },
    setLayoutSettings: function (partialSettings) {
      applyGridSettings(partialSettings || {});
      var activeCanvas = window.LGraphCanvas.active_canvas;
      if (activeCanvas && activeCanvas.graph) {
        relayoutAllSmartGroups(activeCanvas.graph);
      }
      syncHudWithGridSettings();
    },
  };

  window.__smartGridDebug = {
    ensureGroupState: ensureGroupState,
    updateLayout: updateLayout,
    findColumnHit: findColumnHit,
  };

  window.LGraphCanvas.prototype.__smartGridPatched = true;
})();

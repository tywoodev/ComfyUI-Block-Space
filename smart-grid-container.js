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
    gridLineAlpha: 0.32,
  };
  var gridSettings = {
    rowPadding: DEFAULT_GRID_SETTINGS.rowPadding,
    rowTopPadding: DEFAULT_GRID_SETTINGS.rowTopPadding,
    rowBottomPadding: DEFAULT_GRID_SETTINGS.rowBottomPadding,
    nodeVerticalGap: DEFAULT_GRID_SETTINGS.nodeVerticalGap,
    borderJunctionGap: DEFAULT_GRID_SETTINGS.borderJunctionGap,
    gridLineWidth: DEFAULT_GRID_SETTINGS.gridLineWidth,
    gridLineAlpha: DEFAULT_GRID_SETTINGS.gridLineAlpha,
  };
  var ROW_PADDING = gridSettings.rowPadding;
  var INNER_NODE_PADDING = ROW_PADDING;
  var ROW_NODE_TOP_PADDING = gridSettings.rowTopPadding;
  var ROW_NODE_BOTTOM_PADDING = gridSettings.rowBottomPadding;
  var NODE_VERTICAL_GAP = gridSettings.nodeVerticalGap;
  var BORDER_JUNCTION_GAP = gridSettings.borderJunctionGap;
  var GRID_LINE_WIDTH = gridSettings.gridLineWidth;
  var GRID_LINE_ALPHA = gridSettings.gridLineAlpha;

  var originalOnGroupAdd = window.LGraphCanvas.onGroupAdd;
  var originalGroupSerialize = window.LGraphGroup.prototype.serialize;
  var originalGroupConfigure = window.LGraphGroup.prototype.configure;
  var originalDrawGroups = window.LGraphCanvas.prototype.drawGroups;
  var originalGetGroupMenuOptions = window.LGraphCanvas.prototype.getGroupMenuOptions;
  var originalProcessContextMenu = window.LGraphCanvas.prototype.processContextMenu;
  var originalProcessMouseDown = window.LGraphCanvas.prototype.processMouseDown;
  var originalProcessMouseMove = window.LGraphCanvas.prototype.processMouseMove;
  var originalProcessMouseUp = window.LGraphCanvas.prototype.processMouseUp;
  var originalGraphRemove = window.LGraph && window.LGraph.prototype
    ? window.LGraph.prototype.remove
    : null;
  var originalNodeSetSize = window.LGraphNode && window.LGraphNode.prototype
    ? window.LGraphNode.prototype.setSize
    : null;

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
    gridSettings.gridLineAlpha = clampNumber(
      toNumber(partial.gridLineAlpha, gridSettings.gridLineAlpha),
      0.1,
      0.9
    );

    ROW_PADDING = gridSettings.rowPadding;
    INNER_NODE_PADDING = ROW_PADDING;
    ROW_NODE_TOP_PADDING = Math.max(ROW_PADDING + 4, gridSettings.rowTopPadding);
    ROW_NODE_BOTTOM_PADDING = Math.max(ROW_PADDING + 2, gridSettings.rowBottomPadding);
    NODE_VERTICAL_GAP = gridSettings.nodeVerticalGap;
    BORDER_JUNCTION_GAP = gridSettings.borderJunctionGap;
    GRID_LINE_WIDTH = gridSettings.gridLineWidth;
    GRID_LINE_ALPHA = gridSettings.gridLineAlpha;
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
      };
    }
    if (!group.__isSmartGrid) {
      group.__isSmartGrid = true;
    }
    return group.__smartGridState;
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

  function findSplitterHit(canvas, canvasX, canvasY) {
    if (!canvas || !canvas.graph) {
      return null;
    }
    var groups = getSmartGroups(canvas.graph);
    for (var g = groups.length - 1; g >= 0; g -= 1) {
      var group = groups[g];
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

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
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
    // For single-node rows, allow shrinking back down to intrinsic min height.
    var boundedMinHeight = (singleNodeColumn && !singleNodeRow)
      ? Math.max(minHeight, rowHeight)
      : minHeight;
    // If this row has exactly one node, allow vertical resizing to drive row height.
    var boundedMaxHeight = singleNodeRow
      ? Number.POSITIVE_INFINITY
      : (singleNodeColumn ? boundedMinHeight : Number.POSITIVE_INFINITY);

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
        pruneTrailingEmptyRows(state);
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
    if (!node) {
      return [Math.max(10, Number(width) || 10), Math.max(10, Number(height) || 10)];
    }
    var bounds = getManagedNodeResizeBounds(node);
    var minWidth = bounds
      ? Math.max(10, Number(bounds.minWidth) || 10)
      : Math.max(10, Number(getNodeIntrinsicMinSize(node)[0]) || 10);
    var minHeight = bounds
      ? Math.max(10, Number(bounds.minHeight) || 10)
      : Math.max(10, Number(getNodeIntrinsicMinSize(node)[1]) || 10);
    var maxWidth = bounds && isFinite(bounds.maxWidth) ? Math.max(minWidth, Number(bounds.maxWidth) || minWidth) : Number.POSITIVE_INFINITY;
    var maxHeight = bounds && isFinite(bounds.maxHeight) ? Math.max(minHeight, Number(bounds.maxHeight) || minHeight) : Number.POSITIVE_INFINITY;
    var safeWidth = Math.max(minWidth, Number(width) || minWidth);
    var safeHeight = Math.max(minHeight, Number(height) || minHeight);
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
        var target = size && size.length >= 2
          ? [Number(size[0]) || 0, Number(size[1]) || 0]
          : (this.size && this.size.length >= 2 ? [this.size[0], this.size[1]] : [0, 0]);
        var clamped = clampManagedNodeSize(this, target[0], target[1]);
        if (!this.size || this.size.length < 2) {
          this.size = [clamped[0], clamped[1]];
        } else {
          this.size[0] = clamped[0];
          this.size[1] = clamped[1];
        }
        this.__smartGridManualSize = [clamped[0], clamped[1]];
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
    try {
      var oldHeight = group.size[1];
      var oldBottom = group.pos[1] + oldHeight;
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

      // Pass 1: resolve row heights from node minimum/manual requirements.
      for (var rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        var rowState = state.rows[rowIndex];
        normalizeRowFlexPercents(rowState);
        var rowColumns = rowState.columns || [];
        var rowContentHeight = Math.max(24, MIN_ROW_HEIGHT - ROW_NODE_TOP_PADDING - ROW_NODE_BOTTOM_PADDING);

        for (var baselineCol = 0; baselineCol < rowColumns.length; baselineCol += 1) {
          var baselineIds = Array.isArray(rowColumns[baselineCol].childNodeIds)
            ? rowColumns[baselineCol].childNodeIds
            : [];
          for (var baselineNodeIndex = 0; baselineNodeIndex < baselineIds.length; baselineNodeIndex += 1) {
            var baselineNode = getNodeById(group.graph, baselineIds[baselineNodeIndex]);
            if (!baselineNode) {
              continue;
            }
            var baselineMin = getNodeIntrinsicMinSize(baselineNode);
            var baselineMinHeight = Math.max(0, Number(baselineMin[1]) || 0);
            var manualBaseline = baselineNode.__smartGridManualSize && baselineNode.__smartGridManualSize.length >= 2
              ? Math.max(0, Number(baselineNode.__smartGridManualSize[1]) || 0)
              : 0;
            var currentBaseline = baselineNode.size && baselineNode.size.length >= 2
              ? Math.max(0, Number(baselineNode.size[1]) || 0)
              : 0;
            var baselineHeight = Math.max(baselineMinHeight, manualBaseline, currentBaseline);
            if (baselineHeight > rowContentHeight) {
              rowContentHeight = baselineHeight;
            }
          }
        }

        rowState.heightPx = Math.max(
          MIN_ROW_HEIGHT,
          rowContentHeight + ROW_NODE_TOP_PADDING + ROW_NODE_BOTTOM_PADDING
        );
        contentBottom += rowState.heightPx;
      }

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
            var targetNodeHeightBase = Math.max(minNodeHeight, manualHeight, currentHeight);
            var targetNodeHeight = shouldStretchColumn
              ? Math.max(targetNodeHeightBase, rowHeightTarget)
              : targetNodeHeightBase;

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

      var newHeight = Math.max(80, Math.round((contentBottom - group.pos[1]) + ROW_PADDING * 0.5));
      group.size[1] = newHeight;

      var deltaY = newHeight - oldHeight;
      if (shouldPush && deltaY !== 0) {
        pushItemsBelow(group, deltaY, oldBottom);
      }
    } finally {
      group.__smartGridUpdatingLayout = false;
    }
  }

  function drawSmartGridOverlay(canvas, ctx, group) {
    if (!group || !group.__isSmartGrid) {
      return;
    }
    var geometry = getGridGeometry(group);
    var hover = canvas.__smartGridHover;

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255," + GRID_LINE_ALPHA + ")";
    ctx.lineWidth = GRID_LINE_WIDTH;

    for (var r = 0; r < geometry.rows.length; r += 1) {
      var row = geometry.rows[r];
      if (r > 0) {
        ctx.beginPath();
        ctx.moveTo(row.x, row.y + 0.5);
        ctx.lineTo(row.x + row.width, row.y + 0.5);
        ctx.stroke();
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
          ctx.beginPath();
          ctx.moveTo(splitX + 0.5, startY);
          ctx.lineTo(splitX + 0.5, endY);
          ctx.stroke();
        }
      }
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

  function findDropTargetForNode(canvas, node) {
    if (!canvas || !canvas.graph || !node || !node.size) {
      return null;
    }
    var centerX = node.pos[0] + node.size[0] * 0.5;
    var centerY = node.pos[1] + node.size[1] * 0.5;

    var groups = getSmartGroups(canvas.graph);
    for (var i = groups.length - 1; i >= 0; i -= 1) {
      var group = groups[i];
      if (!group.isPointInside(centerX, centerY, 0, true)) {
        continue;
      }
      var hit = findColumnHit(group, centerX, centerY);
      if (hit) {
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
    if (!rowPaddingInput || !topPaddingInput || !bottomPaddingInput || !nodeGapInput || !borderGapInput) {
      return false;
    }
    rowPaddingInput.value = String(Math.round(gridSettings.rowPadding));
    topPaddingInput.value = String(Math.round(gridSettings.rowTopPadding));
    bottomPaddingInput.value = String(Math.round(gridSettings.rowBottomPadding));
    nodeGapInput.value = String(Math.round(gridSettings.nodeVerticalGap));
    borderGapInput.value = String(Math.round(gridSettings.borderJunctionGap));
    return true;
  }

  function setupHudGridSettingsControls() {
    var rowPaddingInput = document.getElementById("smartgrid-row-padding");
    var topPaddingInput = document.getElementById("smartgrid-top-padding");
    var bottomPaddingInput = document.getElementById("smartgrid-bottom-padding");
    var nodeGapInput = document.getElementById("smartgrid-node-gap");
    var borderGapInput = document.getElementById("smartgrid-border-gap");
    if (!rowPaddingInput || !topPaddingInput || !bottomPaddingInput || !nodeGapInput || !borderGapInput) {
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
    rowPaddingInput.addEventListener("change", applyFromHud);
    topPaddingInput.addEventListener("change", applyFromHud);
    bottomPaddingInput.addEventListener("change", applyFromHud);
    nodeGapInput.addEventListener("change", applyFromHud);
    borderGapInput.addEventListener("change", applyFromHud);
    rowPaddingInput.__smartGridBound = true;
    topPaddingInput.__smartGridBound = true;
    bottomPaddingInput.__smartGridBound = true;
    nodeGapInput.__smartGridBound = true;
    borderGapInput.__smartGridBound = true;
    syncHudWithGridSettings();
    return true;
  }

  loadGridSettings();
  if (!setupHudGridSettingsControls()) {
    setTimeout(setupHudGridSettingsControls, 0);
    setTimeout(setupHudGridSettingsControls, 150);
  }

  window.LGraphCanvas.onGroupAdd = function (info, entry, mouse_event) {
    if (typeof originalOnGroupAdd === "function") {
      originalOnGroupAdd.apply(this, arguments);
      var canvas = window.LGraphCanvas.active_canvas;
      if (canvas && canvas.graph && canvas.graph._groups && canvas.graph._groups.length) {
        var group = canvas.graph._groups[canvas.graph._groups.length - 1];
        ensureGroupState(group);
        updateLayout(group, false);
      }
      return;
    }

    var activeCanvas = window.LGraphCanvas.active_canvas;
    if (!activeCanvas) {
      return;
    }
    var group = new window.LiteGraph.LGraphGroup();
    group.pos = activeCanvas.convertEventToCanvasOffset(mouse_event);
    activeCanvas.graph.add(group);
    ensureGroupState(group);
    updateLayout(group, false);
  };

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
      return;
    }
  };

  window.LGraphCanvas.prototype.drawGroups = function (canvas, ctx) {
    originalDrawGroups.apply(this, arguments);
    if (!this.graph || !Array.isArray(this.graph._groups)) {
      return;
    }
    for (var i = 0; i < this.graph._groups.length; i += 1) {
      var group = this.graph._groups[i];
      if (!group || !group.__isSmartGrid) {
        continue;
      }
      refreshManagedNodeBounds(group);
      drawSmartGridOverlay(this, ctx, group);
    }
  };

  window.LGraphCanvas.prototype.getGroupMenuOptions = function (group) {
    var options = originalGetGroupMenuOptions.apply(this, arguments) || [];
    if (!group || !group.__isSmartGrid) {
      return options;
    }

    var rowIndex = getContextRowIndex(this, group);
    var state = ensureGroupState(group);
    var candidateRow = state.rows[rowIndex];
    var canRemoveRow = !!candidateRow && !rowHasAnyNodes(candidateRow) && state.rows.length > 1;
    options.push(
      null,
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
    if (event && typeof this.adjustMouseEvent === "function") {
      this.adjustMouseEvent(event);
    }

    var isLeftButton = event && (event.button === 0 || event.which === 1);
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
    if (isLeftButton) {
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
      this.selected_group.__smartGridResizeStartHeight = this.selected_group.size
        ? this.selected_group.size[1]
        : 0;
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
      var minResizeWidth = getGroupMinWidthPx(this.selected_group);
      this.selected_group.size = [
        Math.max(minResizeWidth, roundToSnapPixels(this.selected_group.size[0])),
        this.selected_group.__smartGridResizeStartHeight || this.selected_group.size[1],
      ];
      updateLayout(this.selected_group, false);
      this.dirty_canvas = true;
      this.dirty_bgcanvas = true;
    }

    var isBusyDragging =
      !!this.node_dragged || !!this.resizing_node || !!this.dragging_canvas || !!this.dragging_rectangle;
    if (!isBusyDragging && event && typeof event.canvasX === "number" && typeof event.canvasY === "number") {
      var splitterHoverHit = findSplitterHit(this, event.canvasX, event.canvasY);
      if (splitterHoverHit && this.canvas && this.canvas.style) {
        this.canvas.style.cursor = "col-resize";
      } else if (this.canvas && this.canvas.style && this.canvas.style.cursor === "col-resize") {
        this.canvas.style.cursor = "";
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
      var hover = findDropTargetForNode(this, this.node_dragged);
      if (
        hover &&
        (!this.__smartGridHover ||
          this.__smartGridHover.group !== hover.group ||
          this.__smartGridHover.rowIndex !== hover.rowIndex ||
          this.__smartGridHover.colIndex !== hover.colIndex)
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

    return result;
  };

  window.LGraphCanvas.prototype.processMouseUp = function (event) {
    if (event && typeof this.adjustMouseEvent === "function") {
      this.adjustMouseEvent(event);
    }

    var splitterDrag = this.__smartGridSplitterDrag;
    if (splitterDrag) {
      this.__smartGridSplitterDrag = null;
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

    var draggedNode = this.node_dragged || null;
    var resizedNode = this.resizing_node || null;
    var resizedGroup = this.selected_group_resizing && this.selected_group && this.selected_group.__isSmartGrid
      ? this.selected_group
      : null;
    var result = originalProcessMouseUp.apply(this, arguments);

    if (resizedGroup) {
      var minGroupWidth = getGroupMinWidthPx(resizedGroup);
      resizedGroup.size = [
        Math.max(minGroupWidth, roundToSnapPixels(resizedGroup.size[0])),
        resizedGroup.__smartGridResizeStartHeight || resizedGroup.size[1],
      ];
      updateLayout(resizedGroup, false);
      resizedGroup.__smartGridResizeStartHeight = 0;
    }

    if (draggedNode) {
      var hit = findDropTargetForNode(this, draggedNode);
      if (hit) {
        var dragSnapshot = this.__smartGridNodeDragSnapshot;
        var targetCol = getColumnByIndex(hit.group, hit.rowIndex, hit.colIndex);
        if (targetCol) {
          if (!Array.isArray(targetCol.childNodeIds)) {
            targetCol.childNodeIds = [];
          }
          var occupyingNodeId = null;
          for (var existingIndex = 0; existingIndex < targetCol.childNodeIds.length; existingIndex += 1) {
            var existingId = targetCol.childNodeIds[existingIndex];
            if (existingId !== draggedNode.id) {
              occupyingNodeId = existingId;
              break;
            }
          }

          var impactedGroups = [];
          var sourceGroup = findManagingGroupForNode(this.graph, draggedNode.id);
          var sourceLocation = sourceGroup ? findManagedNodeLocation(sourceGroup, draggedNode.id) : null;

          var previousGroups = removeNodeFromAllSmartColumns(this.graph, draggedNode.id);
          impactedGroups = impactedGroups.concat(previousGroups);

          // Enforce one node per cell; if occupied, swap occupant into dragged node's source cell.
          if (occupyingNodeId != null) {
            var occupyingGroups = removeNodeFromAllSmartColumns(this.graph, occupyingNodeId);
            impactedGroups = impactedGroups.concat(occupyingGroups);

            if (sourceGroup && sourceLocation) {
              var sourceCol = getColumnByIndex(sourceGroup, sourceLocation.rowIndex, sourceLocation.colIndex);
              if (sourceCol) {
                sourceCol.childNodeIds = [occupyingNodeId];
                if (impactedGroups.indexOf(sourceGroup) === -1) {
                  impactedGroups.push(sourceGroup);
                }
              }
            }
          }

          targetCol.childNodeIds = [draggedNode.id];
          if (impactedGroups.indexOf(hit.group) === -1) {
            impactedGroups.push(hit.group);
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
    this.__smartGridNodeDragSnapshot = null;

    return result;
  };

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
    getLayoutSettings: function () {
      return {
        rowPadding: gridSettings.rowPadding,
        rowTopPadding: gridSettings.rowTopPadding,
        rowBottomPadding: gridSettings.rowBottomPadding,
        nodeVerticalGap: gridSettings.nodeVerticalGap,
        borderJunctionGap: gridSettings.borderJunctionGap,
        gridLineWidth: gridSettings.gridLineWidth,
        gridLineAlpha: gridSettings.gridLineAlpha,
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

(function () {
  "use strict";

  var PATCH_VERSION = "2026-02-25-phase4-fixes-1";

  if (typeof window.LiteGraph === "undefined" || typeof window.LGraphNode === "undefined") {
    console.error("[SmartSizing] LiteGraph is unavailable.");
    return;
  }

  if (window.LGraphNode.prototype.__smartSizingPatched) {
    if (window.LGraphNode.prototype.__smartSizingPatchVersion === PATCH_VERSION) {
      return;
    }
    // Upgrade path: restore originals first, then apply latest patch.
    if (typeof window.LGraphNode.prototype.__smartSizingOriginalComputeSize === "function") {
      window.LGraphNode.prototype.computeSize = window.LGraphNode.prototype.__smartSizingOriginalComputeSize;
    }
    if (typeof window.LGraphNode.prototype.__smartSizingOriginalSetSize === "function") {
      window.LGraphNode.prototype.setSize = window.LGraphNode.prototype.__smartSizingOriginalSetSize;
    }
  }

  var MIN_NODE_WIDTH = 150;
  var MAX_TEXT_WIDTH = 250;
  var PORT_PADDING = 40;

  var originalComputeSize = window.LGraphNode.prototype.computeSize;
  var originalSetSize = window.LGraphNode.prototype.setSize;
  var originalConfigure = window.LGraphNode.prototype.configure;
  var originalGraphAdd = window.LGraph && window.LGraph.prototype ? window.LGraph.prototype.add : null;
  var originalDrawNode = window.LGraphCanvas && window.LGraphCanvas.prototype ? window.LGraphCanvas.prototype.drawNode : null;

  if (typeof originalComputeSize !== "function" || typeof originalSetSize !== "function") {
    console.error("[SmartSizing] Required LGraphNode APIs are unavailable.");
    return;
  }

  var measureCanvas = document.createElement("canvas");
  var measureCtx = measureCanvas.getContext("2d");

  function getNodeFontSize() {
    return (window.LiteGraph && window.LiteGraph.NODE_TEXT_SIZE) || 14;
  }

  function getNodeFont() {
    return getNodeFontSize() + "px Arial";
  }

  function measureTextWidth(text) {
    if (!measureCtx || !text) {
      return 0;
    }
    measureCtx.font = getNodeFont();
    return measureCtx.measureText(String(text)).width;
  }

  function truncateToWidth(text, maxWidth) {
    if (text == null) {
      return "";
    }
    var value = String(text);
    if (!value || measureTextWidth(value) <= maxWidth) {
      return value;
    }

    var ellipsis = "...";
    var ellipsisWidth = measureTextWidth(ellipsis);
    if (ellipsisWidth >= maxWidth) {
      return ellipsis;
    }

    var left = 0;
    var right = value.length;
    while (left < right) {
      var mid = Math.ceil((left + right) / 2);
      var candidate = value.slice(0, mid) + ellipsis;
      if (measureTextWidth(candidate) <= maxWidth) {
        left = mid;
      } else {
        right = mid - 1;
      }
    }
    return value.slice(0, left) + ellipsis;
  }

  function getSlotText(slot) {
    if (!slot) {
      return "";
    }
    return slot.label != null ? slot.label : slot.name || "";
  }

  function getSlotMaxWidth(slots) {
    if (!Array.isArray(slots) || !slots.length) {
      return 0;
    }
    var maxWidth = 0;
    for (var i = 0; i < slots.length; i += 1) {
      var text = truncateToWidth(getSlotText(slots[i]), MAX_TEXT_WIDTH);
      var width = Math.min(MAX_TEXT_WIDTH, measureTextWidth(text));
      if (width > maxWidth) {
        maxWidth = width;
      }
    }
    return maxWidth;
  }

  function getWidgetSize(widget, currentWidth) {
    if (!widget) {
      return [0, 0];
    }

    var size = null;
    if (typeof widget.computeSize === "function") {
      try {
        size = widget.computeSize(currentWidth);
      } catch (error) {
        size = null;
      }
    }

    if (!size || size.length < 2) {
      var options = widget.options || {};
      var widgetWidth = widget.width || options.width || options.w || 0;
      var widgetHeight = widget.height || options.height || options.h || window.LiteGraph.NODE_WIDGET_HEIGHT || 20;
      size = [widgetWidth, widgetHeight];
    }

    var width = Math.max(0, Number(size[0]) || 0);
    var height = Math.max(0, Number(size[1]) || 0);
    return [width, height];
  }

  function computeWidgetBounds(node, startWidth) {
    var widgets = Array.isArray(node.widgets) ? node.widgets : null;
    if (!widgets || !widgets.length) {
      return { width: 0, height: 0 };
    }

    var maxWidth = 0;
    var totalHeight = 0;
    for (var i = 0; i < widgets.length; i += 1) {
      var size = getWidgetSize(widgets[i], startWidth);
      if (size[0] > maxWidth) {
        maxWidth = size[0];
      }
      totalHeight += size[1] + 4;
    }
    totalHeight += 8;
    return { width: maxWidth, height: totalHeight };
  }

  function isNodeBeingResized(node) {
    if (!node || !node.graph || !node.graph.list_of_graphcanvas) {
      return false;
    }
    var canvases = node.graph.list_of_graphcanvas;
    for (var i = 0; i < canvases.length; i += 1) {
      var canvas = canvases[i];
      if (canvas && canvas.resizing_node === node) {
        return true;
      }
    }
    return false;
  }

  window.LGraphNode.prototype.computeSize = function (out) {
    var size = out || new Float32Array([0, 0]);
    var rows = Math.max(this.inputs ? this.inputs.length : 1, this.outputs ? this.outputs.length : 1);
    rows = Math.max(rows, 1);

    var maxInputWidth = getSlotMaxWidth(this.inputs);
    var maxOutputWidth = getSlotMaxWidth(this.outputs);
    var clampedTitle = truncateToWidth(this.title || "", MAX_TEXT_WIDTH);
    var titleWidth = Math.min(MAX_TEXT_WIDTH, measureTextWidth(clampedTitle));

    var slotTextWidth = Math.min((MAX_TEXT_WIDTH * 2) + PORT_PADDING, maxInputWidth + maxOutputWidth + PORT_PADDING);
    var titleRequiredWidth = titleWidth + PORT_PADDING;
    var textMinWidth = Math.max(slotTextWidth, titleRequiredWidth, MIN_NODE_WIDTH);

    var widgetBounds = computeWidgetBounds(this, textMinWidth);
    var minWidth = Math.max(textMinWidth, widgetBounds.width);

    var slotStartY = this.constructor.slot_start_y || 0;
    var slotHeight = (window.LiteGraph && window.LiteGraph.NODE_SLOT_HEIGHT) || 20;
    var minHeight = slotStartY + rows * slotHeight;

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

    var resizing = isNodeBeingResized(this);
    if (!resizing && !this.__smartGridManaged && this.__smartUserSize && this.__smartUserSize.length >= 2) {
      minWidth = Math.max(minWidth, this.__smartUserSize[0]);
      minHeight = Math.max(minHeight, this.__smartUserSize[1]);
    }

    this.__smartMinSize = [minWidth, minHeight];

    size[0] = minWidth;
    size[1] = minHeight;
    return size;
  };

  window.LGraphNode.prototype.setSize = function (size) {
    var result = originalSetSize.apply(this, arguments);
    if (isNodeBeingResized(this) && this.size && this.size.length >= 2) {
      this.__smartUserSize = [this.size[0], this.size[1]];
    }
    return result;
  };

  if (typeof originalConfigure === "function") {
    window.LGraphNode.prototype.configure = function (info) {
      var result = originalConfigure.apply(this, arguments);
      if (this.size && this.size.length >= 2) {
        this.__smartUserSize = [this.size[0], this.size[1]];
      }
      return result;
    };
  }

  if (originalGraphAdd && typeof originalGraphAdd === "function") {
    window.LGraph.prototype.add = function (node, skipComputeOrder) {
      var result = originalGraphAdd.apply(this, arguments);
      if (node && node.constructor !== window.LGraphGroup && typeof node.computeSize === "function" && typeof node.setSize === "function") {
        node.setSize(node.computeSize());
      }
      return result;
    };
  }

  function applyTruncatedLabelsTemporarily(node) {
    var restorations = [];
    if (!node) {
      return restorations;
    }

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

    var slots = [];
    if (Array.isArray(node.inputs)) {
      slots = slots.concat(node.inputs);
    }
    if (Array.isArray(node.outputs)) {
      slots = slots.concat(node.outputs);
    }

    for (var i = 0; i < slots.length; i += 1) {
      var slot = slots[i];
      if (!slot) {
        continue;
      }
      var truncated = truncateToWidth(getSlotText(slot), MAX_TEXT_WIDTH);
      storeAndAssign(slot, "label", truncated);
      slot.__smartDisplayLabel = truncated;
    }

    return restorations;
  }

  function restoreTemporaryValues(restorations) {
    if (!restorations || !restorations.length) {
      return;
    }
    for (var i = restorations.length - 1; i >= 0; i -= 1) {
      var item = restorations[i];
      if (!item.hadOwn) {
        delete item.target[item.key];
      } else {
        item.target[item.key] = item.previous;
      }
    }
  }

  if (typeof originalDrawNode === "function") {
    window.LGraphCanvas.prototype.drawNode = function (node, ctx) {
      var restorations = applyTruncatedLabelsTemporarily(node);
      try {
        return originalDrawNode.apply(this, arguments);
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
  window.LGraphNode.prototype.__smartSizingOriginalComputeSize = originalComputeSize;
  window.LGraphNode.prototype.__smartSizingOriginalSetSize = originalSetSize;
})();

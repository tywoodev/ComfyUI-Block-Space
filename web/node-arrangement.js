(function () {
  "use strict";

  if (typeof window.LGraphCanvas === "undefined" || !window.LGraphCanvas.prototype) {
    return;
  }

  // --- Logic Helpers ---

  function getNodeBounds(node) {
    if (!node || !node.pos || !node.size) return null;
    var left = Number(node.pos[0]) || 0;
    var top = Number(node.pos[1]) || 0;
    var width = Math.max(0, Number(node.size[0]) || 0);
    var contentHeight = Math.max(0, Number(node.size[1]) || 0);
    var titleH = Number(window.LiteGraph && window.LiteGraph.NODE_TITLE_HEIGHT) || 24;
    return {
      left: left,
      right: left + width,
      top: top,
      bottom: top + contentHeight + titleH,
    };
  }

  function getSettings() {
    return {
      hMargin: window.BlockSpaceNodeSnap && typeof window.BlockSpaceNodeSnap.getHSnapMargin === "function" 
                ? window.BlockSpaceNodeSnap.getHSnapMargin() : 60,
      vMargin: window.BlockSpaceNodeSnap && typeof window.BlockSpaceNodeSnap.getVSnapMargin === "function" 
                ? window.BlockSpaceNodeSnap.getVSnapMargin() : 40
    };
  }

  // --- Arrangement Actions ---

  function arrangeSelection(canvas, axis) {
    var selected = canvas.selected_nodes;
    if (!selected) return;
    
    var nodes = [];
    for (var id in selected) {
      if (selected[id] && selected[id].pos) nodes.push(selected[id]);
    }
    if (nodes.length < 2) return;

    var settings = getSettings();

    // 1. Anchor Rule: Top-leftmost node stays static
    nodes.sort(function(a, b) {
      if (a.pos[1] !== b.pos[1]) return a.pos[1] - b.pos[1];
      return a.pos[0] - b.pos[0];
    });
    var anchor = nodes[0];

    // 2. Sorting Heuristic for the axis
    if (axis === "y") {
      nodes.sort(function(a, b) { return a.pos[1] - b.pos[1]; });
    } else {
      nodes.sort(function(a, b) { return a.pos[0] - b.pos[0]; });
    }

    // 3. Spacing Logic
    var currentX = anchor.pos[0];
    var currentY = anchor.pos[1];

    for (var i = 1; i < nodes.length; i++) {
      var prev = nodes[i - 1];
      var node = nodes[i];
      var prevBounds = getNodeBounds(prev);

      if (axis === "y") {
        node.pos[0] = anchor.pos[0];
        node.pos[1] = prevBounds.bottom + settings.vMargin;
      } else {
        node.pos[1] = anchor.pos[1];
        node.pos[0] = prevBounds.right + settings.hMargin;
      }
    }

    canvas.dirty_canvas = true;
    canvas.dirty_bgcanvas = true;
  }

  // --- Context Menu Hook ---

  var originalGetCanvasMenuOptions = window.LGraphCanvas.prototype.getCanvasMenuOptions;
  window.LGraphCanvas.prototype.getCanvasMenuOptions = function () {
    var options = originalGetCanvasMenuOptions.apply(this, arguments);
    
    // Only show if multiple nodes are selected
    var selectedCount = this.selected_nodes ? Object.keys(this.selected_nodes).length : 0;
    
    if (selectedCount > 1) {
      options.push(null); // Separator
      options.push({
        content: "📐 Block Space",
        has_submenu: true,
        callback: function() {}, // No-op for parent item
        submenu: {
          options: [
            {
              content: "Stack Vertically",
              callback: function() { arrangeSelection(this, "y"); }.bind(this)
            },
            {
              content: "Flow Horizontally",
              callback: function() { arrangeSelection(this, "x"); }.bind(this)
            }
          ]
        }
      });
    }

    return options;
  };

  console.log("[BlockSpace] Node Arrangement loaded.");
})();

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
      width: width,
      height: contentHeight + titleH
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

  function arrangeSelection(canvas, mode) {
    var selected = canvas.selected_nodes;
    if (!selected) return;
    
    var nodes = [];
    for (var id in selected) {
      if (selected[id] && selected[id].pos) nodes.push(selected[id]);
    }
    if (nodes.length < 2) return;

    var settings = getSettings();

    // 1. Initial Sort to define the Anchor and Order
    // Sort by Y primarily, then X.
    nodes.sort(function(a, b) {
      if (Math.abs(a.pos[1] - b.pos[1]) > 5) return a.pos[1] - b.pos[1];
      return a.pos[0] - b.pos[0];
    });
    var anchor = nodes[0];
    var startX = anchor.pos[0];
    var startY = anchor.pos[1];

    if (mode === "grid") {
      var numCols = Math.ceil(Math.sqrt(nodes.length));
      var colWidths = [];
      var rowHeights = [];

      // Pass 1: Determine Max Widths/Heights for each cell in the grid
      for (var i = 0; i < nodes.length; i++) {
        var col = i % numCols;
        var row = Math.floor(i / numCols);
        var b = getNodeBounds(nodes[i]);
        if (!b) continue;

        if (colWidths[col] === undefined || b.width > colWidths[col]) colWidths[col] = b.width;
        if (rowHeights[row] === undefined || b.height > rowHeights[row]) rowHeights[row] = b.height;
      }

      // Pass 2: Apply positions
      var yOffset = startY;
      for (var r = 0; r < rowHeights.length; r++) {
        var xOffset = startX;
        for (var c = 0; c < numCols; c++) {
          var idx = r * numCols + c;
          if (idx >= nodes.length) break;

          var node = nodes[idx];
          node.pos[0] = xOffset;
          node.pos[1] = yOffset;

          xOffset += colWidths[c] + settings.hMargin;
        }
        yOffset += rowHeights[r] + settings.vMargin;
      }
    } else {
      // Original Stack/Flow logic
      for (var i = 1; i < nodes.length; i++) {
        var prev = nodes[i - 1];
        var node = nodes[i];
        var prevBounds = getNodeBounds(prev);

        if (mode === "y") {
          node.pos[0] = anchor.pos[0];
          node.pos[1] = prevBounds.bottom + settings.vMargin;
        } else {
          node.pos[1] = anchor.pos[1];
          node.pos[0] = prevBounds.right + settings.hMargin;
        }
      }
    }

    canvas.dirty_canvas = true;
    canvas.dirty_bgcanvas = true;
  }

  // --- Floating Panel UI ---

  var panel = null;

  function createPanel() {
    if (panel) return panel;

    panel = document.createElement("div");
    panel.id = "block-space-arrangement-panel";
    panel.style.position = "fixed";
    panel.style.top = "20px";
    panel.style.left = "50%";
    panel.style.transform = "translateX(-50%)";
    panel.style.backgroundColor = "rgba(30, 30, 30, 0.95)";
    panel.style.border = "1px solid #444";
    panel.style.borderRadius = "8px";
    panel.style.padding = "8px 12px";
    panel.style.display = "none";
    panel.style.flexDirection = "row";
    panel.style.gap = "10px";
    panel.style.alignItems = "center";
    panel.style.boxShadow = "0 4px 15px rgba(0,0,0,0.5)";
    panel.style.zIndex = "10000";
    panel.style.transition = "opacity 0.2s ease, transform 0.2s ease";
    panel.style.pointerEvents = "auto";

    var label = document.createElement("span");
    label.innerText = "📐 Block Space";
    label.style.color = "#888";
    label.style.fontSize = "11px";
    label.style.fontWeight = "bold";
    label.style.marginRight = "6px";
    label.style.whiteSpace = "nowrap";
    panel.appendChild(label);

    var createBtn = function(text, icon, callback) {
      var btn = document.createElement("button");
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
    };

    panel.appendChild(createBtn("Stack", "↕️", function() {
      if (window.app && window.app.canvas) arrangeSelection(window.app.canvas, "y");
    }));

    panel.appendChild(createBtn("Flow", "↔️", function() {
      if (window.app && window.app.canvas) arrangeSelection(window.app.canvas, "x");
    }));

    panel.appendChild(createBtn("Grid", "⊞", function() {
      if (window.app && window.app.canvas) arrangeSelection(window.app.canvas, "grid");
    }));

    document.body.appendChild(panel);
    return panel;
  }

  function updatePanelVisibility() {
    var canvas = window.app && window.app.canvas;
    if (!canvas) return;

    var selectedCount = 0;
    if (canvas.selected_nodes) {
      selectedCount = Object.keys(canvas.selected_nodes).length;
    }

    var p = createPanel();
    if (selectedCount > 1) {
      if (p.style.display === "none") {
        p.style.display = "flex";
        p.style.opacity = "0";
        p.style.transform = "translateX(-50%) translateY(-10px)";
        setTimeout(function() {
          p.style.opacity = "1";
          p.style.transform = "translateX(-50%) translateY(0)";
        }, 10);
      }
    } else {
      if (p.style.display === "flex") {
        p.style.opacity = "0";
        p.style.transform = "translateX(-50%) translateY(-10px)";
        setTimeout(function() {
          p.style.display = "none";
        }, 200);
      }
    }
  }

  // Poll for selection changes
  setInterval(updatePanelVisibility, 200);

  console.log("[BlockSpace] Arrangement Panel with Grid support loaded.");
})();

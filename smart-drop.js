(function () {
  "use strict";

  if (
    typeof window.LGraphCanvas === "undefined" ||
    !window.LGraphCanvas.prototype
  ) {
    console.error("[SmartDrop] LGraphCanvas is unavailable.");
    return;
  }

  if (window.LGraphCanvas.prototype.__smartDropPatched) {
    return;
  }

  var originalProcessMouseUp = window.LGraphCanvas.prototype.processMouseUp;
  if (typeof originalProcessMouseUp !== "function") {
    console.error("[SmartDrop] processMouseUp is unavailable.");
    return;
  }
  var activeMenuCleanup = null;

  function splitTypes(typeValue) {
    if (typeValue == null || typeValue === "") {
      return [];
    }

    if (Array.isArray(typeValue)) {
      return typeValue
        .map(function (value) {
          return String(value).trim().toUpperCase();
        })
        .filter(Boolean);
    }

    return String(typeValue)
      .split(/[|,]/)
      .map(function (value) {
        return value.trim().toUpperCase();
      })
      .filter(Boolean);
  }

  function isWildcardType(typeValue) {
    if (typeValue == null || typeValue === "") {
      return true;
    }

    if (Array.isArray(typeValue)) {
      return typeValue.length === 0 || typeValue.indexOf("*") !== -1;
    }

    return String(typeValue).trim() === "*";
  }

  function areTypesCompatible(originType, inputType) {
    if (isWildcardType(originType) || isWildcardType(inputType)) {
      return true;
    }

    var originTypes = splitTypes(originType);
    var inputTypes = splitTypes(inputType);

    for (var i = 0; i < originTypes.length; i += 1) {
      if (inputTypes.indexOf(originTypes[i]) !== -1) {
        return true;
      }
    }

    return false;
  }

  function captureOriginDragState(canvas) {
    if (!canvas || !canvas.connecting_node) {
      return null;
    }

    var originNode = canvas.connecting_node;
    var originSlotIndex = -1;

    if (typeof canvas.connecting_slot === "number") {
      originSlotIndex = canvas.connecting_slot;
    } else if (typeof canvas.connecting_output === "number") {
      originSlotIndex = canvas.connecting_output;
    } else if (originNode.outputs && canvas.connecting_output) {
      originSlotIndex = originNode.outputs.indexOf(canvas.connecting_output);
    }

    if (originSlotIndex < 0 || !originNode.outputs || !originNode.outputs[originSlotIndex]) {
      return null;
    }

    var originOutput = originNode.outputs[originSlotIndex];
    var linkCountBefore = Array.isArray(originOutput.links) ? originOutput.links.length : 0;

    return {
      originNode: originNode,
      originSlotIndex: originSlotIndex,
      originOutput: originOutput,
      linkCountBefore: linkCountBefore,
    };
  }

  function destroyActiveMenu() {
    if (typeof activeMenuCleanup === "function") {
      activeMenuCleanup();
      activeMenuCleanup = null;
    }
  }

  function createAmbiguityMenu(params) {
    destroyActiveMenu();

    var clientX = params.clientX;
    var clientY = params.clientY;
    var matches = params.matches;
    var originNode = params.originNode;
    var originSlotIndex = params.originSlotIndex;
    var targetNode = params.targetNode;
    var canvasElement = params.canvasElement;

    var menu = document.createElement("div");
    menu.className = "smart-drop-menu";
    menu.style.position = "fixed";
    menu.style.left = clientX + 8 + "px";
    menu.style.top = clientY + 8 + "px";
    menu.style.zIndex = "9999";
    menu.style.minWidth = "180px";
    menu.style.background = "#20232a";
    menu.style.color = "#f2f2f2";
    menu.style.border = "1px solid #4a4f59";
    menu.style.borderRadius = "8px";
    menu.style.boxShadow = "0 8px 20px rgba(0,0,0,0.35)";
    menu.style.padding = "6px";
    menu.style.fontFamily = "Arial, sans-serif";
    menu.style.fontSize = "13px";

    var title = document.createElement("div");
    title.textContent = "Select input";
    title.style.padding = "6px 8px";
    title.style.opacity = "0.85";
    title.style.borderBottom = "1px solid #3b4048";
    title.style.marginBottom = "4px";
    menu.appendChild(title);

    matches.forEach(function (match) {
      var item = document.createElement("button");
      item.type = "button";
      item.textContent = match.inputName;
      item.style.display = "block";
      item.style.width = "100%";
      item.style.textAlign = "left";
      item.style.border = "0";
      item.style.borderRadius = "5px";
      item.style.padding = "7px 8px";
      item.style.background = "transparent";
      item.style.color = "#f2f2f2";
      item.style.cursor = "pointer";

      item.addEventListener("mouseenter", function () {
        item.style.background = "#2f3541";
      });

      item.addEventListener("mouseleave", function () {
        item.style.background = "transparent";
      });

      item.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        originNode.connect(originSlotIndex, targetNode, match.inputIndex);
        destroyActiveMenu();
      });

      menu.appendChild(item);
    });

    document.body.appendChild(menu);

    var removeOutsideListeners = function () {};

    function dismissOnOutsidePointer(event) {
      if (!menu.contains(event.target)) {
        destroyActiveMenu();
      }
    }

    function dismissOnEscape(event) {
      if (event.key === "Escape") {
        destroyActiveMenu();
      }
    }

    var outsideHandler = dismissOnOutsidePointer;
    var escapeHandler = dismissOnEscape;

    window.setTimeout(function () {
      document.addEventListener("pointerdown", outsideHandler, true);
      document.addEventListener("keydown", escapeHandler, true);
      if (canvasElement) {
        canvasElement.addEventListener("pointerdown", outsideHandler, true);
      }
    }, 0);

    removeOutsideListeners = function () {
      document.removeEventListener("pointerdown", outsideHandler, true);
      document.removeEventListener("keydown", escapeHandler, true);
      if (canvasElement) {
        canvasElement.removeEventListener("pointerdown", outsideHandler, true);
      }
    };

    var cleanupMenu = function () {
      removeOutsideListeners();
      if (menu.parentNode) {
        menu.parentNode.removeChild(menu);
      }
      if (activeMenuCleanup === cleanupMenu) {
        activeMenuCleanup = null;
      }
    };
    activeMenuCleanup = cleanupMenu;
  }

  window.LGraphCanvas.prototype.processMouseUp = function (event) {
    if (typeof this.adjustMouseEvent === "function" && event) {
      this.adjustMouseEvent(event);
    }

    var dropCanvasX = event && typeof event.canvasX === "number" ? event.canvasX : null;
    var dropCanvasY = event && typeof event.canvasY === "number" ? event.canvasY : null;
    var dropClientX = event && typeof event.clientX === "number" ? event.clientX : 0;
    var dropClientY = event && typeof event.clientY === "number" ? event.clientY : 0;

    var dragState = captureOriginDragState(this);
    var hadActiveDrag = !!dragState;

    var result = originalProcessMouseUp.apply(this, arguments);

    if (!hadActiveDrag || !dragState || !dragState.originOutput) {
      return result;
    }

    var currentLinkCount = Array.isArray(dragState.originOutput.links)
      ? dragState.originOutput.links.length
      : 0;

    // If default LiteGraph behavior connected successfully, keep it untouched.
    if (currentLinkCount > dragState.linkCountBefore) {
      return result;
    }

    if (!this.graph || typeof this.graph.getNodeOnPos !== "function") {
      return result;
    }

    if (typeof dropCanvasX !== "number" || typeof dropCanvasY !== "number") {
      return result;
    }

    var targetNode = this.graph.getNodeOnPos(dropCanvasX, dropCanvasY);
    if (!targetNode || !Array.isArray(targetNode.inputs) || targetNode.inputs.length === 0) {
      return result;
    }

    var originType = dragState.originOutput.type;

    var validMatches = [];
    for (var i = 0; i < targetNode.inputs.length; i += 1) {
      var input = targetNode.inputs[i];
      if (!input) {
        continue;
      }

      if (areTypesCompatible(originType, input.type)) {
        validMatches.push({
          inputIndex: i,
          inputName: input.name || "input_" + i,
        });
      }
    }

    if (validMatches.length === 0) {
      return result;
    }

    if (validMatches.length === 1) {
      dragState.originNode.connect(
        dragState.originSlotIndex,
        targetNode,
        validMatches[0].inputIndex
      );
      return result;
    }

    createAmbiguityMenu({
      clientX: dropClientX,
      clientY: dropClientY,
      matches: validMatches,
      originNode: dragState.originNode,
      originSlotIndex: dragState.originSlotIndex,
      targetNode: targetNode,
      canvasElement: this.canvas,
    });

    return result;
  };

  window.LGraphCanvas.prototype.__smartDropPatched = true;
  window.LGraphCanvas.prototype.__smartDropOriginalProcessMouseUp = originalProcessMouseUp;
})();

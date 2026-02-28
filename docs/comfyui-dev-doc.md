# ComfyUI Custom Node Development: JavaScript Handbook
**Target Audience:** AI Coding Agents & Frontend/Extension Developers  
**Purpose:** Technical reference for extending the ComfyUI client via JavaScript.

---

## 1. Architecture & The Client-Server Model
ComfyUI uses a bifurcated Client-Server model:
* **Server (Python):** Handles core execution, PyTorch operations, node definitions, and the topological sort (DAG) execution.
* **Client (JavaScript):** An interactive UI built on top of **LiteGraph.js**. It handles graph visualization, user inputs, and JSON serialization.

### The Python-to-JS Bridge
To inject JavaScript into the ComfyUI client, you must declare a `WEB_DIRECTORY` in your custom node's Python `__init__.py` file.
```python
# __init__.py
WEB_DIRECTORY = "./web"  # ComfyUI will automatically serve all .js files in this folder

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]

```

*Note: You do not need an `index.html`. ComfyUI automatically parses and loads every `.js` file found in the `WEB_DIRECTORY` when the app boots.*

---

## 2. Extension Registration & Lifecycle Hooks

Extensions are registered using `app.registerExtension(configObject)`. You must import `app` from the core ComfyUI scripts.

### Basic Registration Boilerplate

```javascript
import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "your.unique.namespace.ExtensionName",
    
    // 1. App initialization hooks
    async setup() {
        console.log("Called when the Comfy webpage is fully loaded.");
    },

    // 2. Node registration hooks (Fires for EVERY node type registered)
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        // Hijack node prototypes here to apply changes to ALL instances of a node type
        if (nodeType.comfyClass === "TargetNodeName") {
            // Modify nodeType.prototype
        }
    },

    // 3. Node instantiation hooks (Fires when a node drops onto the canvas)
    async nodeCreated(node) {
        // Modify individual node instances here
        if (node.comfyClass === "TargetNodeName") {
            // Apply custom instance properties
        }
    }
});

```

### Important App Hooks Overview

* `init()`: Very early setup.
* `setup()`: Called at the end of the startup process. Best place to bind global UI event listeners.
* `beforeRegisterNodeDef(nodeType, nodeData, app)`: Ideal for monkey-patching `nodeType.prototype` methods (like `onNodeCreated`, `onConnectionsChange`).
* `nodeCreated(node)`: Called when an individual instance of a node is spawned.
* `loadedGraphNode(node, app)`: Called after a node has been fully loaded/restored from a saved workflow JSON.

---

## 3. Context Menus (Modern API)

*(Note: Modifying `LGraphCanvas.prototype.getCanvasMenuOptions` is deprecated. Use the declarative hooks below).*

To add items to the right-click context menus, define these methods inside your `registerExtension` object:

### Canvas Background Menu

```javascript
getCanvasMenuItems(canvas) {
    return [
        null, // Inserts a visual divider
        {
            content: "My Custom Action",
            callback: () => { console.log("Action triggered"); }
        }
    ];
}

```

### Node-Specific Menu

```javascript
getNodeMenuItems(node) {
    const items = [];
    if (node.comfyClass === "KSampler") {
        items.push({
            content: "Advanced Options",
            submenu: { // Declarative submenus are fully supported
                options: [
                    { content: "Option 1", callback: () => {} },
                    { content: "Option 2", callback: () => {} }
                ]
            }
        });
    }
    return items;
}

```

---

## 4. Manipulating Nodes & LiteGraph Hijacking

ComfyUI nodes inherit from `LGraphNode`.

### The `node` Object Structure

* `node.pos`: `[x, y]` array of canvas coordinates.
* `node.size`: `[width, height]` array.
* `node.inputs`: Array of input slots (`{name, type, link}`).
* `node.outputs`: Array of output slots.
* `node.widgets`: Array of interactive UI elements on the node (e.g., sliders, text boxes).

### Adding/Modifying Widgets

```javascript
async nodeCreated(node) {
    // Add a standard widget (STRING, INT, FLOAT, BOOLEAN, COMBO)
    const myWidget = node.addWidget("text", "MyLabel", "DefaultValue", (val) => {
        console.log("Widget changed to:", val);
    });

    // Add a custom HTML DOM widget
    const domEl = document.createElement("div");
    const domWidget = node.addDOMWidget("MyDOMWidget", "custom", domEl);
}

```

### Monkey-Patching LiteGraph Methods

To change core drawing or interaction behavior, securely monkey-patch the prototype methods during `beforeRegisterNodeDef` or on the instance during `nodeCreated`.

```javascript
async beforeRegisterNodeDef(nodeType, nodeData, app) {
    if (nodeType.comfyClass === "TargetNode") {
        const original_onDrawForeground = nodeType.prototype.onDrawForeground;
        
        nodeType.prototype.onDrawForeground = function(ctx) {
            // 1. Call original method safely
            const result = original_onDrawForeground?.apply(this, arguments);
            
            // 2. Add custom Canvas 2D rendering
            ctx.fillStyle = "red";
            ctx.fillRect(10, 10, 50, 50);
            
            return result;
        };
    }
}

```

---

## 5. UI APIs & Event Listeners

### Keybindings & Commands API

Register commands and keyboard shortcuts cleanly within `registerExtension`:

```javascript
commands: [
    {
        id: "my.extension.run",
        label: "Run My Tool",
        function: () => { console.log("Run!"); }
    }
],
keybindings: [
    {
        combo: { key: "r", ctrl: true },
        commandId: "my.extension.run"
    }
]

```

### Settings API

Inject options directly into the native ComfyUI settings gear menu.

```javascript
import { app } from "../../scripts/app.js";

app.ui.settings.addSetting({
    id: "myExtension.GridPadding",
    name: "Grid Padding Size",
    type: "slider",
    attrs: { min: 0, max: 100, step: 1 },
    defaultValue: 20,
    tooltip: "Adjusts the padding between snapped nodes.",
    onChange: (newVal, oldVal) => {
        console.log("Padding changed:", newVal);
    }
});

```

### Workflow Execution Events

To listen for when a user clicks the "Queue Prompt" button or a workflow finishes:

```javascript
import { api } from "../../scripts/api.js";

// Call these inside setup()
api.addEventListener("execution_start", (e) => { console.log("Started"); });
api.addEventListener("executed", (e) => { console.log("Node finished executing", e.detail); });

```

---

## 6. Accessing the Graph State

The `app.graph` object (an instance of `LGraph`) contains the current topological state.

* `app.graph._nodes_by_id`: Dictionary of all nodes on canvas.
* `app.graph.links`: Dictionary of all wires/connections.
* `app.canvas`: The visual renderer (`LGraphCanvas` instance). Useful for getting the current view scale/offset or the selected items list (`app.canvas.selectedItems`).
* `app.graphToPrompt()`: Converts the current visual graph into the raw JSON Prompt Dictionary that gets sent to the Python server.

---

## 7. Developer Best Practices & Standing Orders

1. **Never use CSS `display: none` to hide nodes.** It breaks graph serialization.
2. **Defensive Patching:** When hijacking a method (e.g., `onResize`, `onMouseDown`), always capture the `original_method` and `?.apply(this, arguments)` it to prevent breaking other extensions.
3. **Debugging:** The JS environment runs in the browser. Use `console.log()` and standard Chrome/Firefox DevTools. Force disable the browser cache while developing JS files to prevent ComfyUI from loading stale versions.
4. **Coordinate Spaces:** LiteGraph uses a dual coordinate system. Be careful to differentiate between Canvas coordinates (absolute virtual space) and Client coordinates (browser window pixels) when handling mouse events.

---

## 8. Detecting Node Visible Edges (Canvas Geometry)

ComfyUI nodes are canvas-rendered, so there is no DOM border element to query. Detect edges from graph geometry:

```javascript
function getNodeBounds(node) {
  const left = Number(node.pos[0]) || 0;
  const top = Number(node.pos[1]) || 0;       // node body top (below title bar)
  const width = Math.max(0, Number(node.size[0]) || 0);
  const height = Math.max(0, Number(node.size[1]) || 0);
  return { left, top, right: left + width, bottom: top + height };
}
```

### Important: True Visual Top Edge

`node.pos[1]` is typically the body top, not the full visual top including title.  
To draw overlays on the real top border:

```javascript
const titleH = Number(LiteGraph.NODE_TITLE_HEIGHT) || 24;
const fullTop = bounds.top - titleH;
const fullHeight = (bounds.bottom - bounds.top) + titleH;
```

### Canvas-to-Client Conversion (for DOM overlays)

```javascript
const scale = canvas.ds.scale;
const x = graphX * scale + canvas.ds.offset[0];
const y = graphY * scale + canvas.ds.offset[1];
```

Use `fullTop/fullHeight` when you need border-accurate overlays that include the title bar.

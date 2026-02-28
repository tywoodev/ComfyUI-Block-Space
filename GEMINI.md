# GEMINI.md - ComfyUI Block Space Context

## Project Overview
**ComfyUI Block Space** is a high-fidelity frontend UX enhancement suite for ComfyUI and LiteGraph-based node editors. It aims to reduce friction in building, reading, and maintaining complex node graphs through smarter interaction patterns and structural layout tools.

### Key Technologies
- **Frontend:** JavaScript (ES6+), LiteGraph.js (Canvas-based rendering).
- **Backend (ComfyUI Integration):** Python (minimal `__init__.py` for serving web assets).
- **Environment:** Dual-mode architecture supporting both a standalone **Sandbox Prototype** and a live **ComfyUI Extension**.

### Architecture
- **Core Logic (`web/*.js`):** Modular components for specific UX features (Smart Drop, Connection Focus, Smart Sizing, Smart Grid, Node Snapping).
- **ComfyUI Bridge (`web/extensions/comfyui-block-space/index.js`):** Integrates core features into the ComfyUI lifecycle using `app.registerExtension`.
- **Sandbox Bridge (`web/bootstrap.js`, `web/app.js`):** Provides a mock environment for rapid testing outside of ComfyUI.

---

## Building and Running

### 1. ComfyUI Extension Mode (Production/Live Test)
- **Installation:** Clone this repository into the `custom_nodes/` directory of your ComfyUI installation.
  ```bash
  cd ComfyUI/custom_nodes
  git clone <repository-url> comfyui-block-space
  ```
- **Execution:** Start ComfyUI as usual. The extension will auto-load from the `web/` directory.
- **Settings:** Configuration options are available in the ComfyUI Settings menu under the "Block Space" prefix.

### 2. Standalone Sandbox Mode (Development/Prototyping)
- **Execution:** Run a local web server from the project root.
  ```bash
  python -m http.server 8000
  ```
- **Access:** Open `http://localhost:8000` (or `test.html`) in a browser.
- **Features:** Includes a debug HUD for real-time parameter tuning and a demo graph.

---

## Development Conventions

### Coding Style
- **Modular Components:** Each major feature should reside in its own file in `web/` (e.g., `smart-drop.js`).
- **Defensive Patching:** When modifying LiteGraph or ComfyUI behavior, always use monkey-patching with "Original Call" preservation:
  ```javascript
  const old_method = LGraphCanvas.prototype.someMethod;
  LGraphCanvas.prototype.someMethod = function() {
      // Custom logic
      return old_method.apply(this, arguments);
  };
  ```
- **Coordinate Spaces:** Distinguish carefully between **Graph Coordinates** (virtual space) and **Canvas/Client Coordinates** (screen pixels). Use `canvas.ds.scale` and `canvas.ds.offset` for conversion.

### Core Features Reference
- **Smart Drop (`smart-drop.js`):** Type-aware auto-connection when dropping nodes on bodies.
- **Connection Focus (`connection-focus.js`):** Visual highlighting and "pulsing" of active flow paths.
- **Smart Sizing (`smart-sizing.js`):** Node bounds enforcement based on content and labels.
- **Smart Grid (`smart-grid-container.js`):** Structured layout tools (rows, columns, docking).
- **Node Snapping (`node-snapping.js`):** Edge-alignment guides and snapping behavior.

### Documentation
- `docs/comfyui-dev-doc.md`: Comprehensive guide for ComfyUI frontend development.
- `README.md`: High-level feature overview and quick start.

### Standing Orders
- **Persistence:** Avoid using CSS `display: none` for nodes; it breaks serialization.
- **Validation:** Currently manual. Use the Sandbox mode to verify UI interactions across different LiteGraph versions if possible.
- **Settings:** Register all user-facing toggles in `registerExtension` using `app.ui.settings.addSetting`.

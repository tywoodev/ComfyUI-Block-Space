# GEMINI.md - ComfyUI Block Space Context

## Project Overview
**ComfyUI Block Space** is a high-fidelity frontend UX enhancement suite for ComfyUI. It reduces friction in building, reading, and maintaining complex node graphs through smarter interaction patterns and visual tracing.

### Key Technologies
- **Frontend:** JavaScript (ES6+), LiteGraph.js (Canvas-based rendering).
- **Backend (ComfyUI Integration):** Python (minimal `__init__.py` for serving web assets).
- **Environment:** Seamless integration as a ComfyUI Extension via the `/web` directory.

### Architecture
- **Core Logic (`web/*.js`):** Modular components for specific UX features (Smart Drop, Connection Focus, Smart Sizing, Node Snapping).
- **ComfyUI Bridge (`web/extensions/comfyui-block-space/index.js`):** Integrates core features into the ComfyUI lifecycle using `app.registerExtension`.

---

## Building and Running

### ComfyUI Extension Mode
- **Installation:** Clone this repository into the `custom_nodes/` directory of your ComfyUI installation.
  ```bash
  cd ComfyUI/custom_nodes
  git clone <repository-url> comfyui-block-space
  ```
- **Execution:** Start ComfyUI as usual. The extension will auto-load from the `web/` directory.
- **Settings:** Configuration options are available in the ComfyUI Settings menu under the "Block Space" prefix.

---

## Development Conventions

### Coding Style
- **Modular Components:** Each major feature resides in its own file in `web/` (e.g., `smart-drop.js`).
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
- **Connection Focus (`connection-focus.js`):** Visual highlighting and "pulsing" of active flow paths with port color matching.
- **Smart Sizing (`smart-sizing.js`):** Node bounds enforcement based on content and label truncation.
- **Node Snapping (`node-snapping.js`):** Edge-alignment guides and snapping behavior during drag and resize.

### Documentation
- `docs/comfyui-dev-doc.md`: Comprehensive guide for ComfyUI frontend development.
- `README.md`: High-level feature overview and quick start.

### Standing Orders
- **Persistence:** Avoid using CSS `display: none` for nodes; it breaks serialization.
- **Validation:** Currently manual. Verify UI interactions directly within a ComfyUI installation.
- **Settings:** Register all user-facing toggles in `registerExtension` using `app.ui.settings.addSetting`.

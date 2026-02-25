# ComfyUI Better Nodes (Prototype)

ComfyUI Better Nodes is a frontend UX prototype that upgrades default LiteGraph-style node interactions with faster wiring, clearer visual tracing, smarter sizing, and structured layout tools.  
The goal is simple: make complex ComfyUI-style graphs easier to build, read, and maintain.

## Why this improves default behavior

| Built-in friction | Better Nodes improvement |
|---|---|
| You usually need precise port targeting to connect nodes. | **Smart Drop** lets you drop on node body and auto-connects by compatible type. |
| Dense graphs are hard to trace visually. | **Connection Focus** dims unrelated nodes/links and highlights active flow paths. |
| Node labels/widgets can break layout or require manual cleanup. | **Smart Sizing** enforces text clamps while allowing large widgets to define true minimum size. |
| Groups are mostly freeform and can become messy. | **SmartGrid** adds row/column structure, stacking, divider resizing, and alignment snapping. |
| Layout state can be lost between refreshes. | **Workspace persistence** auto-saves and restores graph state from local storage. |

## Core features

- **Smart Drop (`smart-drop.js`)**
  - Drag from output to node body, not only exact input port.
  - Type-aware auto-connect with ambiguity chooser when multiple inputs match.

- **Connection Focus (`connection-focus.js`)**
  - Mouse-hold focus mode with animated link pulse and slot rings.
  - Connector styles: `Hybrid`, `Straight`, `Angled`.
  - Fan-offset rendering for overlapping focused links.

- **Smart Sizing (`smart-sizing.js`)**
  - Enforces minimum node bounds from content.
  - Truncates overly long text labels cleanly.
  - Preserves uncapped custom widget sizing behavior.

- **SmartGrid Container (`smart-grid-container.js`)**
  - Row/column dashboards, draggable splitters, docked node stacks.
  - Collapse/restore groups with stable internal ownership (dock-only children).
  - Edge alignment guides + snapping for drag/resize, with configurable edge-gap.

- **Persistence (`app.js`)**
  - Autosave/restore via `localStorage`.
  - HUD button to reset workspace quickly.

## HUD controls (live)

- Flow color, connector style
- Grid/top/bottom padding
- Node gap, border gap
- Divider width/color/style
- Edge snap gap
- Reset Workspace

## Quick start

```bash
python -m http.server 8000
```

Open: `http://localhost:8000`

If loading directly from file works in your browser, you can also open `index.html`.

## Project layout

- `index.html` — canvas + debug HUD
- `bootstrap.js` — LiteGraph/CDN boot and patch loading
- `smart-drop.js` — body-drop type-aware connect behavior
- `connection-focus.js` — focus visuals and connector rendering
- `smart-sizing.js` — node sizing overrides
- `smart-grid-container.js` — SmartGrid layout/container behavior
- `app.js` — demo nodes, graph init, autosave/restore

## Current scope and limitations

- This repo is a standalone prototype, not a packaged ComfyUI extension installer.
- Validation is currently manual (no automated test suite yet).

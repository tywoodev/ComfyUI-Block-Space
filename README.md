# ComfyUI Block Space (Better Nodes)

A professional frontend UX enhancement suite for ComfyUI and LiteGraph-based node editors. Upgrades default node interactions with smarter wiring, clearer visual tracing, and robust spatial arrangement tools.

The goal: transform ComfyUI into a pixel-perfect, high-efficiency design environment.

## Core Features

### 1. Auto-Arrange & Harmonize (`node-arrangement.js`)
Transform messy node clusters into perfectly aligned blocks with a dedicated, draggable UI panel.
- **↕️ Stack:** Perfectly align selected nodes into a vertical column.
- **↔️ Flow:** Arrange nodes into a clean horizontal row.
- **💎 Harmonize:** Our flagship layout engine. Automatically detects columns, enforces uniform widths within each column, and stretches nodes to match the height of the tallest column for a "precision-cut" professional look.
- **Draggable Panel:** A floating UI that appears automatically when multiple nodes are selected. Grab the drag handle to place it anywhere; it remembers its position across refreshes.
- **Full Undo Support:** Every arrangement action is compatible with `Ctrl+Z`.

### 2. High-Fidelity Snapping (`node-snapping.js`)
Precision snapping that understands node geometry.
- **Title-Bar Aware:** Calculations correctly account for the 24px title bar, ensuring visual edges and margins are pixel-perfect (1:1 with your settings).
- **Envelope Neighbor Search:** Reliably finds snap targets within a 1500px radius, even for nodes with extreme aspect ratios.
- **Cluster-Based Alignment:** Snaps to flush edges, centers, or specific margins with sticky hysteresis to prevent flickering.
- **Visual Guides:** Dotted alignment lines frame the visual boundaries of nodes exactly as they appear on screen.

### 3. Connection Focus (`connection-focus.js`)
Visualize the data flow within your workflow with high-contrast animations.
- **Port Color Matching:** Link pulses and focus rings automatically match the color of the connected port (e.g., violet for CONDITIONING, yellow for CLIP).
- **Enhanced Visibility:** 0.8 alpha white-dashed overlays ensure active connections are visible against any background.
- **Connector Styles:** Toggle between `Hybrid`, `Straight`, and `Angled` styles in the settings.

### 4. Smart Drop (`smart-drop.js`)
- Drag from an output directly to a node body (not just the tiny input port).
- Type-aware auto-connection logic.
- Dynamic ambiguity chooser if multiple inputs match the data type.

### 5. Smart Sizing (`smart-sizing.js`)
- Enforces minimum node bounds derived from content.
- Truncates overly long text labels cleanly to maintain workspace order.

## Settings

Access settings via **ComfyUI Settings** → **Block Space**. Our custom settings menu features:
- **Professional SVG Icons** for clear category identification.
- **Informative Tooltips:** Hover over any setting name for a detailed explanation of its behavior.
- **Real-Time Updates:** Most changes apply immediately without requiring a browser refresh.

## Installation

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/tywoodev/comfy-ui-better-nodes.git comfyui-block-space
```

Restart ComfyUI. The extension auto-loads and injects the "Block Space" panel and settings.

## Project Structure

```
ComfyUI-Block-Space/
├── web/
│   ├── extensions/comfyui-block-space/index.js  # Extension bridge & UI injection
│   ├── node-arrangement.js                      # Auto-layout & draggable panel
│   ├── node-snapping.js                         # High-fidelity snapping engine
│   ├── connection-focus.js                      # Flow tracing & animations
│   ├── smart-drop.js                            # Body-drop auto-connection
│   └── smart-sizing.js                          # Bounds & label enforcement
├── docs/                                        # Documentation
├── __init__.py                                  # Python entry point
└── README.md                                    # This file
```

## Recent Changes

- **Added Auto-Arrange:** Introduced the floating, draggable arrangement panel.
- **Added Harmonize Action:** Precision grid alignment with uniform column sizing.
- **Restored Horizontal Snapping:** Fixed legacy raycasting bugs; unified snapping to a cluster-based engine.
- **Fixed Geometry Math:** All snapping and arrangements are now fully aware of the LiteGraph title bar height.
- **UI Polish:** Replaced emojis with custom SVG branding and added comprehensive settings tooltips.

## License

MIT License - see [LICENSE](LICENSE) for details.

# ComfyUI Block Space (Better Nodes)

A frontend UX enhancement suite for ComfyUI and LiteGraph-based node editors. Upgrades default node interactions with smarter wiring, clearer visual tracing, intelligent sizing, and robust snapping behavior.

The goal: make complex node graphs easier to build, read, and maintain.

## Core Features

### 1. Smart Drop (`smart-drop.js`)
- Drag from output to node body (not just exact input port)
- Type-aware auto-connection
- Ambiguity chooser when multiple inputs match

### 2. Connection Focus (`connection-focus.js`)
- Mouse-hold focus mode with animated link pulse and slot rings
- **Port color matching** - Animation color matches connected port colors
- Connector styles: `Hybrid`, `Straight`, `Angled`
- Configurable via settings panel

### 3. Smart Sizing (`smart-sizing.js`)
- Enforces minimum node bounds from content
- Truncates overly long text labels cleanly
- Preserves uncapped custom widget sizing behavior

### 4. Node Snapping (`node-snapping.js`)
- Edge alignment guides during drag and resize
- Configurable margin and snap strength
- Visual feedback with badges and pulses

## Settings (ComfyUI Extension)

Access settings via **ComfyUI Settings** → **Block Space**:

- **Enable Custom Connectors** - Toggle custom connector rendering on/off
- **Connector Style** - Choose between Hybrid, Straight, or Angled connector styles

Changes apply immediately without needing to refresh.

## Installation

### ComfyUI Extension Mode

```bash
cd ComfyUI/custom_nodes
git clone <repository-url> comfyui-block-space
```

Restart ComfyUI. The extension auto-loads and adds the "Block Space" settings panel.

## Project Structure

```
ComfyUI-Block-Space/
├── web/
│   ├── extensions/comfyui-block-space/index.js  # ComfyUI extension bridge
│   ├── smart-drop.js                            # Type-aware auto-connect
│   ├── connection-focus.js                      # Visual flow highlighting
│   ├── smart-sizing.js                          # Node bounds enforcement
│   └── node-snapping.js                         # Edge alignment guides
├── docs/                                        # Documentation
├── __init__.py                                  # Python entry point
└── README.md                                    # This file
```

## Development

### Key Files

- `web/extensions/comfyui-block-space/index.js` - ComfyUI extension registration
- `web/connection-focus.js` - Connector rendering and focus effects
- `web/node-snapping.js` - Drag/resize snapping logic
- `web/smart-drop.js` - Body-drop connection logic

### Testing

- **No automated tests** currently
- Install in ComfyUI and test with real workflows

## Recent Changes

- Simplified settings to toggle + style dropdown
- Added port color matching for connector animations
- Fixed vertical margin calculation in resize snapping
- Removed SmartGrid and Sandbox features

## License

[Your License Here]

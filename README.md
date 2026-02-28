# TDub's ComfyUI Block Space

A professional UX enhancement suite for ComfyUI. This extension transforms your workspace into a high-efficiency design environment with smarter wiring, precision snapping, and one-click layout optimization.

The goal: build, read, and maintain complex node graphs with pixel-perfect precision.

## Key Features

### 1. Auto-Arrange & Harmonize

Instantly transform messy node clusters into perfectly aligned blocks using our dedicated arrangement panel.

- **↕️ Stack:** Perfectly aligns your selection into a tight vertical column.
- **↔️ Flow:** Organizes nodes into a clean horizontal row.
- **💎 Harmonize:** Our flagship "Zen" layout. It intelligently detects columns, ensures every node in a column has the same width, and stretches nodes to create a perfectly flush, professional grid.
- **Floating Panel:** A sleek UI that appears automatically when multiple nodes are selected. You can drag it anywhere on your screen, and it will remember its position for your next session.
- **Safe Editing:** Every arrangement action fully supports `Ctrl+Z` (Undo), so you can experiment with layouts worry-free.

### 2. High-Fidelity Snapping

Precision snapping that understands the visual geometry of your nodes.

- **True Margins:** Snapping is 100% accurate to your settings, correctly accounting for node title bars so your gaps are always exactly the number of pixels you intended.
- **Smart Alignment:** Effortlessly snap to edges, centers, or specific margins. The system "feels" where you want a node to go and locks it in place.
- **Visual Guides:** Dotted alignment lines appear during drags and resizes to frame your nodes and show exactly which edges are being aligned.

### 3. Visual Flow & Connection Focus

Gain instant clarity on your data flow with high-visibility animations.

- **Port Color Matching:** Tracing a connection? The pulse animations and focus rings automatically match the color of the port (e.g., purple for CONDITIONING, yellow for CLIP), making it easy to follow paths in dense workflows.
- **High-Contrast Tracing:** Animated white-dashed overlays ensure you can see your active connections clearly against any background.
- **Custom Styles:** Choose between `Hybrid`, `Straight`, and `Angled` connector styles in the settings menu.

### 4. Smart Port Connection (Body Drop)

Build workflows faster by removing the need for surgical mouse precision.

- **Body Drop:** Drag a wire from an output and drop it anywhere on a node's body—not just the tiny input port.
- **Type Awareness:** The extension automatically connects to the correct matching input.
- **Quick Chooser:** If a node has multiple matching inputs, a small menu appears at your cursor so you can pick the right one without moving your mouse back and forth.

### 5. Intelligent Node Sizing

Maintains a clean workspace by managing node dimensions automatically.

- **Content-Aware Bounds:** Prevents nodes from being resized too small for their contents.
- **Label Truncation:** Cleanly truncates overly long text labels to prevent visual clutter and keep your graph readable.

## Settings

Customize your experience via **ComfyUI Settings** → **Block Space**. Our custom menu includes:

- **Branded Icons** for easy navigation.
- **Helpful Tooltips:** Hover over any setting name for a plain-English explanation of what it does.
- **Instant Previews:** Most settings apply immediately without requiring you to refresh your browser.

## Installation

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/tywoodev/comfy-ui-better-nodes.git comfyui-block-space
```

Restart ComfyUI. The extension will auto-load and inject the tools and settings panel.

## Recent Updates

- **New Arrangement Panel:** Floating, draggable tool for cleaning up messy selections.
- **Harmonize Mode:** Creates "boxed" grid layouts with uniform column widths.
- **Geometry Fixes:** All snapping now perfectly accounts for node title bar heights.
- **Enhanced Snapping:** Restored and improved horizontal snapping logic for better side-by-side node placement.

## License

MIT License - see [LICENSE](LICENSE) for details.

# TDub's ComfyUI Block Space

A professional UX enhancement suite for ComfyUI. This extension transforms your workspace into a high-efficiency design environment with smarter wiring, precision snapping, and one-click layout optimization.

The goal: build, read, and maintain complex node graphs with pixel-perfect precision.

---

## 1. High-Fidelity Snapping & Harmonizing

Precision snapping that understands the visual geometry of your nodes. 

![Snapping & Harmonizing](assets/snap-harmonize.gif)

- **True Margins:** Snapping is 100% accurate to your settings, correctly accounting for node title bars so your gaps are always exactly the number of pixels you intended.
- **Harmonize Action:** Instantly transform messy node clusters into perfectly aligned blocks. Our intelligent layout engine detects columns, enforces uniform widths, and balances heights for a professional, "boxed" look.
- **Visual Guides:** Dotted alignment lines appear during drags and resizes to frame your nodes and show exactly which edges are being aligned.

## 2. Animated Flow Visualization

Gain instant clarity on your data flow with high-visibility animations and port indicators.

![Animated Connectors](assets/animated-connectors.gif)

- **Port Color Matching:** The pulse animations and connection rings automatically match the color of the port (e.g., purple for CONDITIONING, yellow for CLIP), making it easy to follow paths in dense workflows.
- **Enhanced Stubs:** High-contrast rings (stubs) appear on active ports during focus, providing clear visual targets for easier tracing and connection management.
- **White-Dashed Overlays:** Animated overlays ensure you can see your active connections clearly against any background or node color.

## 3. Custom Connector Types

Choose the aesthetic that best fits your workflow and reduces visual noise.

![Connector Types](assets/connector-types.gif)

- **Hybrid Style:** The best of both worlds. Features elegant curves for short hops and straight lines for longer runs, maintaining a clean yet organic look.
- **Straight Style:** Minimalist and direct. Perfect for high-density workflows where reducing overlapping curves is a priority.
- **Angled Style:** A technical, "circuit-board" aesthetic that creates very clear horizontal and vertical pathways, ideal for highly structured layouts.

## 4. Shift to Bypass Snapping

Handle intricate positioning with ease without fighting the alignment engine.

![Shift to Bypass](assets/shift-to-bypass.gif)

- **Micro-Adjustments:** Hold the **Shift** key while dragging or resizing to temporarily disable snapping. This allows for pixel-perfect placement in tight spaces where you need a node to sit between standard grid points.
- **Total Control:** Bypass gives you the freedom to handle unique edge cases without needing to toggle snapping off in the settings menu.

## 5. Professional Settings Panel

Customize your experience with an intuitive, branded interface.

![Settings](assets/settings.gif)

- **Informative Tooltips:** Hover over any setting name for a detailed explanation of its behavior.
- **Real-Time Updates:** Most settings apply immediately, allowing you to fine-tune your margins and colors without refreshing your browser. (A refresh is required after changing the ConnectorStyle)

---

## Installation

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/tywoodev/comfy-ui-better-nodes.git comfyui-block-space
```

Restart ComfyUI. The extension will auto-load and inject the arrangement tools, snapping engine, and settings panel.

## License

MIT License - see [LICENSE](LICENSE) for details.

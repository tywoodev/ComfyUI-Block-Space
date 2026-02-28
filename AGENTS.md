# AGENTS.md - ComfyUI Block Space

This document provides essential context for AI coding agents working on the ComfyUI Block Space project.

---

## Project Overview

**ComfyUI Block Space** is a frontend UX enhancement suite for ComfyUI and LiteGraph-based node editors. It upgrades default node interactions with smarter wiring, clearer visual tracing, intelligent sizing, and structured layout tools. The goal is to make complex node graphs easier to build, read, and maintain.

The project supports a **dual-mode architecture**:
1. **Standalone Sandbox Mode** - For rapid prototyping and development outside of ComfyUI
2. **ComfyUI Extension Mode** - Live integration as a ComfyUI custom node

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | JavaScript (ES5-style with IIFEs), LiteGraph.js |
| Backend | Python (minimal, for ComfyUI integration only) |
| Styling | Vanilla CSS |
| CDN Dependencies | LiteGraph.js 0.7.18 (loaded via jsdelivr/unpkg) |

---

## Project Structure

```
ComfyUI-Block-Space/
├── __init__.py                    # Python entry point for ComfyUI extension
├── web/                           # Frontend assets (served by ComfyUI)
│   ├── extensions/
│   │   └── comfyui-block-space/
│   │       └── index.js           # ComfyUI extension bridge (registerExtension)
│   ├── bootstrap.js               # Sandbox mode: CDN loader, script init
│   ├── app.js                     # Sandbox mode: demo nodes, graph init, persistence
│   ├── better-nodes-settings.js   # Settings store with pub/sub pattern
│   ├── smart-drop.js              # Type-aware auto-connect on body drop
│   ├── connection-focus.js        # Visual flow highlighting, connector styles
│   ├── smart-sizing.js            # Node bounds enforcement, text truncation
│   ├── smart-grid-container.js    # Sandbox only: Row/column layouts, draggable splitters
│   ├── node-snapping.js           # Edge alignment guides and snapping
│   └── test.html                  # Sandbox mode entry point
├── docs/                          # Documentation
│   ├── comfyui-dev-doc.md         # JavaScript/frontend development guide
│   └── comfyui-python-dev-doc.md  # Python backend development guide
├── .github/                       # GitHub Actions workflows
│   ├── workflows/                 # Gemini AI integration (review, triage, invoke)
│   └── commands/                  # Gemini command configurations
├── README.md                      # User-facing documentation
├── GEMINI.md                      # AI context for Gemini workflows
└── AGENTS.md                      # This file
```

---

## Core Features

### 1. Smart Drop (`smart-drop.js`)
- Drag from output to node body (not just exact port)
- Type-aware auto-connection
- Ambiguity chooser when multiple inputs match

### 2. Connection Focus (`connection-focus.js`)
- Mouse-hold focus mode with animated link pulse
- Connector styles: `Hybrid`, `Straight`, `Angled`
- Fan-offset rendering for overlapping focused links

### 3. Smart Sizing (`smart-sizing.js`)
- Enforces minimum node bounds from content
- Truncates overly long text labels
- Preserves uncapped custom widget sizing

### 4. SmartGrid Container (`smart-grid-container.js`) - **Sandbox Only**
- Row/column dashboards with draggable splitters
- Docked node stacks with collapse/restore
- Edge alignment guides + configurable snapping
- **Note:** This feature is only available in Sandbox mode, not in ComfyUI extension mode

### 5. Node Snapping (`node-snapping.js`)
- Edge alignment guides during drag/resize
- Configurable margin and strength settings
- Visual feedback with badges and pulses

---

## Build and Run Commands

This project has **no build step** - it is a static HTML/JS prototype.

### Standalone Sandbox Mode (Development)

```bash
# Option 1: Python HTTP server
python -m http.server 8000
# Then open: http://localhost:8000/web/test.html

# Option 2: Direct file opening (if browser allows file:// access)
# Open web/test.html directly in browser
```

### ComfyUI Extension Mode (Production)

```bash
# Install as ComfyUI custom node
cd ComfyUI/custom_nodes
git clone <repository-url> comfyui-block-space

# Start ComfyUI normally - extension auto-loads
```

---

## Code Style Guidelines

### JavaScript Conventions
- **Style**: ES5-style with IIFEs and `"use strict"`
- **Indentation**: 2 spaces
- **Quotes**: Double quotes preferred
- **Variables**: Use `var` (existing codebase convention)
- **Semicolons**: Include semicolons

### Defensive Patching Pattern
When modifying LiteGraph or ComfyUI behavior, always preserve the original call:

```javascript
const old_method = LGraphCanvas.prototype.someMethod;
LGraphCanvas.prototype.someMethod = function() {
  // Custom logic
  return old_method.apply(this, arguments);
};
```

### Feature Module Structure
Each major feature resides in its own file in `web/`:
- Check for `LGraphCanvas` availability before patching
- Set a flag (e.g., `__smartDropPatched`) to prevent double-patching
- Use `(function () { "use strict"; ... })();` wrapper

### Coordinate Spaces
Distinguish carefully between:
- **Graph Coordinates** - Virtual canvas space (`node.pos`)
- **Canvas/Client Coordinates** - Screen pixels (use `canvas.ds.scale` and `canvas.ds.offset` for conversion)

---

## Testing Strategy

- **No automated tests** currently exist
- **Manual verification** via Sandbox mode:
  1. Open `test.html` in browser
  2. Check console overlay for load status
  3. Test each feature (Smart Drop, Connection Focus, etc.)
  4. Verify HUD controls work correctly

### Testing Checklist
- [ ] Smart Drop connects compatible types
- [ ] Connection Focus highlights on mouse hold
- [ ] Connector style changes apply
- [ ] Node snapping works with visual guides
- [ ] Workspace persistence saves/loads from localStorage
- [ ] Reset Workspace button clears state

---

## Settings and Configuration

### ComfyUI Extension Settings
Settings are registered via `app.ui.settings.addSetting()` and appear under the "Block Space" category:

**Connector Settings:**
- `comfyuiBlockSpace.connector.flowColor` - Pulse/highlight color
- `comfyuiBlockSpace.connector.preferredStyle` - hybrid/straight/angled
- `comfyuiBlockSpace.connector.enableHybrid/Straight/Angled` - Toggle styles

**Node Snap Settings:**
- `comfyuiBlockSpace.nodeSnap.hMarginPx/vMarginPx` - Gap margins
- `comfyuiBlockSpace.nodeSnap.moveStrength/resizeStrength` - Snap strength
- `comfyuiBlockSpace.nodeSnap.highlightEnabled/Color/Width` - Visual guides
- `comfyuiBlockSpace.nodeSnap.feedbackEnabled/*` - Badge and pulse feedback

### Sandbox Mode Settings
Controlled via HUD controls in `test.html`, stored in `window.BetterNodesSettings`.

---

## Runtime Detection

The code detects which runtime it's executing in:

```javascript
// Check if running inside ComfyUI
function isComfyUIRuntime() {
  return !!(window.BetterNodesSettings &&
    typeof window.BetterNodesSettings.isComfyUIRuntime === "function" &&
    window.BetterNodesSettings.isComfyUIRuntime());
}

// Check if running in Sandbox mode
var isSandboxPage = document.body.getAttribute("data-betternodes-sandbox") === "1";
```

Sandbox-only code must exit early if not in sandbox:
```javascript
if (!document.body || document.body.getAttribute("data-betternodes-sandbox") !== "1") {
  return;
}
```

---

## GitHub/Gemini Integration

The repository includes GitHub Actions workflows for AI-assisted development:

- **`gemini-dispatch.yml`** - Routes GitHub events to appropriate workflows
- **`gemini-review.yml`** - Automated PR review
- **`gemini-triage.yml`** - Issue triage
- **`gemini-invoke.yml`** - Custom command invocation

Commands can be triggered via comments:
- `@gemini-cli /review` - Request code review
- `@gemini-cli /triage` - Triage an issue
- `@gemini-cli /approve` - Approve and execute planned changes

---

## Development Standing Orders

1. **Never use CSS `display: none` to hide nodes** - It breaks graph serialization
2. **Always preserve original method calls** when monkey-patching
3. **Test in both Sandbox and ComfyUI modes** when making changes
4. **Update ASSET_VERSION** in `index.js` when modifying scripts to force cache refresh
5. **Register new settings** using `app.ui.settings.addSetting()` for ComfyUI mode
6. **Use the Settings bridge** (`better-nodes-settings.js`) to share config between modes

---

## Documentation References

- `docs/comfyui-dev-doc.md` - Comprehensive JavaScript development guide
- `docs/comfyui-python-dev-doc.md` - Python backend node development
- `GEMINI.md` - AI context for Gemini-powered workflows
- `README.md` - User-facing feature overview

---

## Commit Message Convention

Commit messages should be short, imperative sentences with periods:
- `Add connection focus glow.`
- `Fix node snapping in ComfyUI runtime.`
- `Update connector style defaults.`

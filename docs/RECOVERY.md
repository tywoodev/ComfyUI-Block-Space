# Block Space Recovery Guide

If Block Space fails to load or behaves unexpectedly after an update, follow these steps.

## Quick Fixes

### 1. Hard Refresh (Try This First)

Clears browser cache and reloads all scripts.

- **Windows/Linux:** `Ctrl + F5` or `Ctrl + Shift + R`
- **Mac:** `Cmd + Shift + R`

### 2. Empty Cache and Hard Reload

If a regular hard refresh doesn't work:

1. Open Chrome DevTools (`F12` or `Ctrl+Shift+I`)
2. Right-click the refresh button in the browser toolbar
3. Select **"Empty Cache and Hard Reload"**

### 3. Check Browser Console

Open DevTools (`F12`) and look for red error messages in the Console tab.

Common issues:
- `Failed to load module`: Clear cache and retry
- `adapter-v1.js` errors: Report issue with error message
- `Setting not found`: Reset ComfyUI settings

## Recovery Options

### Option A: Reinstall Extension

```bash
cd ComfyUI/custom_nodes
rm -rf ComfyUI-Block-Space
git clone https://github.com/tywoodev/ComfyUI-Block-Space.git
```

Then restart ComfyUI completely.

### Option B: Rollback to Previous Version

If a recent update broke functionality:

```bash
cd ComfyUI/custom_nodes/ComfyUI-Block-Space

# View recent commits
git log --oneline -10

# Rollback to specific commit
git checkout <commit-hash>

# Example: rollback to commit before adapter refactor
git checkout 736c181
```

To return to latest version later:
```bash
git checkout main
git pull
```

### Option C: Disable Extension Temporarily

If Block Space is preventing ComfyUI from loading:

```bash
cd ComfyUI/custom_nodes
mv ComfyUI-Block-Space ComfyUI-Block-Space.disabled
```

Restart ComfyUI. To re-enable:
```bash
mv ComfyUI-Block-Space.disabled ComfyUI-Block-Space
```

## Getting Help

If none of the above works:

1. **Open browser console** (`F12`)
2. **Copy any red error messages**
3. **Create an issue** at: https://github.com/tywoodev/ComfyUI-Block-Space/issues

Include:
- ComfyUI version
- Browser and version
- Full error message from console
- Steps you've already tried

## Architecture Notes

### Version 2.0+ (Current)
Uses modular architecture:
- `web/index.js` - Entry point
- `web/core-math.js` - Pure spatial logic
- `web/adapter-v1.js` - V1 integration (replaces 5 legacy files)

### Version 1.x (Legacy)
Used individual script files:
- `node-snapping.js`
- `connection-focus.js`
- `smart-drop.js`
- `smart-sizing.js`
- `node-arrangement.js`

These files were consolidated into `adapter-v1.js` in v2.0.

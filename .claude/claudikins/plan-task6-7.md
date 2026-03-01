# Tasks 6 & 7: Entry Point and Extension Integration

## Overview

These two tasks are **tightly coupled** - they should be implemented together in a single commit because:
- Task 6 creates `web/index.js` (the new entry point)
- Task 7 wires the extension to load `web/index.js` instead of individual scripts
- Neither works without the other
- Testing requires both to be in place

## Task 6: Create `web/index.js` (Entry Point)

### Responsibilities

1. **Environment Detection** - Determine if running in V1 (LiteGraph) or V2 (Vue/DOM)
2. **Adapter Loading** - Dynamically import the appropriate adapter
3. **Fallback Handling** - Graceful degradation if adapters fail
4. **Global API Exposure** - Maintain backward compatibility for `window.BlockSpaceNodeSnap`

### Implementation

```javascript
// web/index.js
import { initV1Adapter, cleanupV1Adapter } from './adapter-v1.js';

const BLOCKSPACE_VERSION = "2.0.0-adapter";

/**
 * Detect ComfyUI version/environment
 * V1: window.LGraphCanvas exists
 * V2: window.app.extensionManager exists (no LGraphCanvas)
 */
function detectEnvironment() {
  // V2 detection: Vue-based DOM interface
  if (window.app?.extensionManager?.setting?.get) {
    // Additional check: V2 doesn't have LGraphCanvas
    if (typeof window.LGraphCanvas === 'undefined') {
      return 'v2';
    }
  }
  
  // V1 detection: Classic LiteGraph canvas
  if (typeof window.LGraphCanvas !== 'undefined' && window.LGraphCanvas.prototype) {
    return 'v1';
  }
  
  // Unknown - try V1 as fallback (most extensions still use V1)
  console.warn('[BlockSpace] Could not detect environment, falling back to V1');
  return 'v1';
}

/**
 * Initialize BlockSpace for the detected environment
 */
async function initBlockSpace() {
  const env = detectEnvironment();
  console.log(`[BlockSpace] Detected environment: ${env}`);
  
  switch (env) {
    case 'v1':
      try {
        const success = initV1Adapter();
        if (success) {
          console.log('[BlockSpace] V1 adapter initialized successfully');
          // Maintain backward compatibility
          if (window.BlockSpaceNodeSnap && typeof window.BlockSpaceNodeSnap.resetPersistedHighlightArtifacts === 'function') {
            window.BlockSpaceNodeSnap.resetPersistedHighlightArtifacts(window.app && window.app.canvas);
          }
        } else {
          console.error('[BlockSpace] V1 adapter failed to initialize');
        }
        return success;
      } catch (error) {
        console.error('[BlockSpace] Error initializing V1 adapter:', error);
        return false;
      }
      
    case 'v2':
      console.log('[BlockSpace] V2 detected - loading V2 adapter stub');
      try {
        // For now, just import and log. V2 adapter will be implemented later
        const { initV2Adapter } = await import('./adapter-v2.js');
        return initV2Adapter();
      } catch (error) {
        console.error('[BlockSpace] Error loading V2 adapter:', error);
        return false;
      }
      
    default:
      console.error('[BlockSpace] Unknown environment:', env);
      return false;
  }
}

/**
 * Cleanup function for hot-reloading
 */
export function cleanupBlockSpace() {
  cleanupV1Adapter();
  // cleanupV2Adapter() when implemented
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initBlockSpace);
} else {
  // DOM already loaded
  initBlockSpace();
}

// Also expose for manual initialization
window.BlockSpaceInit = initBlockSpace;
window.BlockSpaceCleanup = cleanupBlockSpace;
window.BlockSpaceVersion = BLOCKSPACE_VERSION;

export { initBlockSpace, cleanupBlockSpace, BLOCKSPACE_VERSION };
export default { initBlockSpace, cleanupBlockSpace, version: BLOCKSPACE_VERSION };
```

## Task 7: Update Extension Loading

### Current State (extensions/comfyui-block-space/index.js)

```javascript
// Current script loading
async function ensureRuntimeScriptsLoaded(baseUrl) {
  const scripts = [
    "../../smart-drop.js",
    "../../smart-sizing.js",
    "../../connection-focus.js",
    "../../node-snapping.js",
    "../../node-arrangement.js",
  ];
  for (const rel of scripts) {
    const url = new URL(rel, baseUrl).toString() + "?v=" + ASSET_VERSION;
    await loadScript(url);
  }
}
```

### Target State

Replace the above with:

```javascript
// New modular loading
async function ensureRuntimeScriptsLoaded(baseUrl) {
  // Load the new modular entry point instead of individual scripts
  const url = new URL("../../index.js", baseUrl).toString() + "?v=" + ASSET_VERSION;
  await loadScript(url);
  
  // Wait for initialization
  if (window.BlockSpaceInit) {
    await window.BlockSpaceInit();
  }
}
```

### Changes to `extensions/comfyui-block-space/index.js`

1. **Remove old script loading** - Delete `ensureRuntimeScriptsLoaded()` entirely
2. **Update `setup()` function** - Use dynamic import or script tag for `index.js`
3. **Keep settings registration** - Still needed
4. **Keep icon injection** - Still needed

### Implementation

```javascript
// extensions/comfyui-block-space/index.js (updated)
import { app } from "/scripts/app.js";

const ASSET_VERSION = "2026-03-01-adapter-v2";

// ... keep addSetting(), getSettingValue(), applyConnectorSettings(), registerBlockSpaceSettings() ...
// ... keep injectSettingsIcon() ...

async function loadScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.type = "module";  // Important: ES modules
    script.async = false;
    script.onload = () => resolve(url);
    script.onerror = () => reject(new Error("Failed to load script: " + url));
    document.body.appendChild(script);
  });
}

app.registerExtension({
  name: "Block Space",
  async setup() {
    // Load BetterNodesSettings (still needed for settings store)
    await loadScript(new URL("../../better-nodes-settings.js", import.meta.url).toString() + "?v=" + ASSET_VERSION);

    if (window.BetterNodesSettings && typeof window.BetterNodesSettings.__setComfyUIRuntime === "function") {
      window.BetterNodesSettings.__setComfyUIRuntime(true);
    }

    // Load the new modular entry point (replaces all individual scripts)
    try {
      const indexUrl = new URL("../../index.js", import.meta.url).toString() + "?v=" + ASSET_VERSION;
      await loadScript(indexUrl);
      
      // Wait for BlockSpace to initialize
      if (window.BlockSpaceInit) {
        await window.BlockSpaceInit();
      }
    } catch (error) {
      console.error("[BlockSpace] Failed to load adapter:", error);
      // Fallback: load original scripts for backward compatibility
      console.warn("[BlockSpace] Falling back to legacy script loading");
      await loadLegacyScripts(import.meta.url);
    }

    registerBlockSpaceSettings();
    injectSettingsIcon();
  },
});

// Fallback for backward compatibility
async function loadLegacyScripts(baseUrl) {
  const scripts = [
    "../../smart-drop.js",
    "../../smart-sizing.js",
    "../../connection-focus.js",
    "../../node-snapping.js",
    "../../node-arrangement.js",
  ];
  for (const rel of scripts) {
    const url = new URL(rel, baseUrl).toString() + "?v=" + ASSET_VERSION;
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.async = false;
      script.onload = () => resolve(url);
      script.onerror = () => reject(new Error("Failed to load: " + url));
      document.body.appendChild(script);
    });
  }
}
```

## Dependency Graph

```
extensions/comfyui-block-space/index.js
    │
    ├─► loads: better-nodes-settings.js (unchanged)
    │
    └─► loads: web/index.js (new - Task 6)
            │
            ├─► imports: web/adapter-v1.js (Task 4)
            │       │
            │       └─► imports: web/core-math.js (Task 1)
            │
            └─► imports: web/adapter-v2.js (Task 5 - stub)
```

## Testing Strategy

1. **V1 Environment**:
   - Load extension in ComfyUI V1
   - Verify `index.js` detects V1
   - Verify `adapter-v1.js` loads and initializes
   - Verify all functionality works (snapping, connectors, etc.)

2. **V2 Environment** (when available):
   - Load extension in ComfyUI V2
   - Verify `index.js` detects V2
   - Verify `adapter-v2.js` stub loads
   - Verify graceful degradation (logs "not implemented")

3. **Fallback**:
   - Break `index.js` intentionally
   - Verify fallback to legacy scripts works

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| ES modules not supported | High | Use `type="module"` on script tag |
| Dynamic import fails | Medium | Wrap in try/catch, fallback to legacy |
| Adapter fails to init | High | Return false, log error, don't crash |
| Original files still load | Low | Check `__patched` flags prevent double-init |

## Recommendation: Implement Together

**Implement Tasks 6 & 7 together** because:

1. **They are atomic** - You can't test one without the other
2. **Single commit** - Easier to revert if issues arise
3. **Clear success criteria** - Extension loads and works end-to-end
4. **Fallback included** - If new system fails, old system takes over

## Implementation Order (Within Combined Task)

1. Create `web/index.js` with environment detection
2. Update `extensions/comfyui-block-space/index.js` to load `index.js`
3. Add fallback logic for safety
4. Test in V1 environment
5. Commit both files together

## Verification Checklist

- [ ] Extension loads without errors
- [ ] `web/index.js` is loaded as ES module
- [ ] V1 environment detected correctly
- [ ] `adapter-v1.js` initializes successfully
- [ ] Node snapping works
- [ ] Connection focus works
- [ ] Smart drop works
- [ ] Smart sizing works
- [ ] Arrangement panel works
- [ ] Settings apply correctly
- [ ] Fallback triggers if `index.js` fails
- [ ] No duplicate patches (check console for "already patched" warnings)

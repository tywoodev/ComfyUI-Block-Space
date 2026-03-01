/**
 * ComfyUI-Block-Space Entry Point
 * 
 * Detects ComfyUI version (V1/V2) and loads the appropriate adapter.
 * Provides unified initialization and cleanup API.
 */

const BLOCKSPACE_VERSION = "2.0.0-adapter";

/**
 * Detect ComfyUI version/environment
 * V1: window.LGraphCanvas exists (LiteGraph canvas)
 * V2: window.comfyAPI exists or __COMFYUI_FRONTEND_VERSION__ >= 2 (Vue/DOM)
 */
function detectEnvironment() {
  // V2 detection: Check for V2-specific APIs first
  // New frontend exposes comfyAPI and has a version marker
  if (typeof window.comfyAPI !== 'undefined') {
    return 'v2';
  }
  
  // Alternative V2 detection: version marker
  if (window.__COMFYUI_FRONTEND_VERSION__ && window.__COMFYUI_FRONTEND_VERSION__ >= 2) {
    return 'v2';
  }
  
  // Check if extensionManager exists without LGraphCanvas
  // This might catch some V2 edge cases
  if (window.app?.extensionManager?.setting?.get && typeof window.LGraphCanvas === 'undefined') {
    return 'v2';
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
        // Dynamic import for ES module
        const { initV1Adapter } = await import('./adapter-v1.js');
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
async function cleanupBlockSpace() {
  const env = detectEnvironment();
  
  if (env === 'v1') {
    try {
      const { cleanupV1Adapter } = await import('./adapter-v1.js');
      cleanupV1Adapter();
    } catch (error) {
      console.error('[BlockSpace] Error cleaning up V1 adapter:', error);
    }
  }
  
  // cleanupV2Adapter() when implemented
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initBlockSpace);
} else {
  // DOM already loaded
  initBlockSpace();
}

// Expose global API
window.BlockSpaceInit = initBlockSpace;
window.BlockSpaceCleanup = cleanupBlockSpace;
window.BlockSpaceVersion = BLOCKSPACE_VERSION;

// ES module exports
export { initBlockSpace, cleanupBlockSpace, BLOCKSPACE_VERSION, detectEnvironment };
export default { initBlockSpace, cleanupBlockSpace, version: BLOCKSPACE_VERSION };

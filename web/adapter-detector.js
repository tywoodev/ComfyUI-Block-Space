/**
 * Environment Detector for ComfyUI V1/V2
 * Detects whether we're running on LiteGraph (V1) or Vue/DOM (V2)
 */

const BLOCKSPACE_VERSION = "2.0.0-adapter";

/**
 * Check for V2 DOM nodes (data-node-id attribute)
 * This is the most reliable differentiator between V1 and V2
 */
function hasV2DOMNodes() {
  return document.querySelectorAll('[data-node-id]').length > 0;
}

/**
 * Check if LiteGraph canvas is the primary rendering method
 * V1: Uses canvas for all node rendering
 * V2: Uses DOM elements for nodes
 */
function isLiteGraphPrimary() {
  const canvas = document.querySelector('canvas.litegraph');
  if (!canvas) return false;
  
  // In V1, the canvas is large and fills the workspace
  // In V2, the canvas might exist but is used for connections/background only
  const rect = canvas.getBoundingClientRect();
  return rect.width > 100 && rect.height > 100;
}

/**
 * Detect ComfyUI environment version
 * Returns 'v1', 'v2', or 'unknown'
 */
export function detectEnvironment() {
  // Method 1: Check for V2-specific DOM nodes
  if (hasV2DOMNodes()) {
    return 'v2';
  }
  
  // Method 2: Check if V2's extensionManager has specific V2-only features
  if (window.app?.extensionManager?.setting?.get && 
      window.app?.extensionManager?.workflow?.activeWorkflow) {
    // This could be V2, but wait for DOM to confirm
    return 'v2-pending';
  }
  
  // Method 3: Check for V1-specific APIs
  if (window.LiteGraph && window.LGraphCanvas && 
      window.app?.graph && !hasV2DOMNodes()) {
    return 'v1';
  }
  
  return 'unknown';
}

/**
 * Wait for environment to stabilize before detection
 * V2 renders DOM nodes asynchronously after page load
 */
export async function waitForEnvironmentDetection(maxWaitMs = 5000) {
  const startTime = Date.now();
  const checkInterval = 200;
  
  while (Date.now() - startTime < maxWaitMs) {
    const env = detectEnvironment();
    
    // If we have a clear answer, return it
    if (env === 'v2' || env === 'v1') {
      return env;
    }
    
    // Wait before checking again
    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }
  
  // Timeout - make best guess
  console.warn('[BlockSpace] Environment detection timed out, making best guess');
  return hasV2DOMNodes() ? 'v2' : 'v1';
}

/**
 * Initialize BlockSpace with the correct adapter
 */
export async function initBlockSpace() {
  console.log('[BlockSpace] Detecting ComfyUI environment...');
  
  const env = await waitForEnvironmentDetection();
  console.log(`[BlockSpace] Detected environment: ${env}`);
  
  try {
    if (env === 'v2') {
      const { initV2Adapter } = await import('./adapter-v2.js');
      const success = initV2Adapter();
      if (success) {
        console.log('[BlockSpace] V2 adapter initialized successfully');
      }
      return success;
    } else {
      const { initV1Adapter } = await import('./adapter-v1.js');
      const success = initV1Adapter();
      if (success) {
        console.log('[BlockSpace] V1 adapter initialized successfully');
      }
      return success;
    }
  } catch (error) {
    console.error('[BlockSpace] Error initializing adapter:', error);
    return false;
  }
}

// Auto-initialize
document.addEventListener('DOMContentLoaded', () => {
  // Small delay to let V2 DOM settle
  setTimeout(initBlockSpace, 500);
});

// Export for manual use
window.BlockSpaceInit = initBlockSpace;
window.BlockSpaceVersion = BLOCKSPACE_VERSION;
window.BlockSpaceDetect = detectEnvironment;

export { BLOCKSPACE_VERSION };

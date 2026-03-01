/**
 * Environment Detector for ComfyUI V1/V2
 * Non-blocking async detection with polling
 */

const BLOCKSPACE_VERSION = "2.0.0-adapter";

// Detection state
let detectionResult = null;
let detectionCallbacks = [];

/**
 * Check for V2 DOM nodes (data-node-id attribute)
 */
function checkV2DOMNodes() {
  return document.querySelector('[data-node-id]') !== null;
}

/**
 * Quick environment check - synchronous
 */
function quickCheck() {
  if (checkV2DOMNodes()) return 'v2';
  
  // If no V2 nodes but we have LiteGraph canvas, probably V1
  const canvas = document.querySelector('canvas.litegraph');
  if (canvas && window.LiteGraph) return 'v1';
  
  return null; // Need to wait
}

/**
 * Poll for environment detection without blocking
 */
function startDetectionPolling() {
  if (detectionResult) return; // Already detected
  
  const maxAttempts = 50; // 5 seconds total (100ms * 50)
  let attempts = 0;
  
  const poll = () => {
    attempts++;
    
    // Try to detect
    const result = quickCheck();
    if (result) {
      detectionResult = result;
      console.log(`[BlockSpace] Detected: ${result} (after ${attempts} attempts)`);
      loadAdapter(result);
      return;
    }
    
    // Continue polling if not maxed out
    if (attempts < maxAttempts) {
      setTimeout(poll, 100);
    } else {
      // Timeout - default to V1
      detectionResult = 'v1';
      console.warn('[BlockSpace] Detection timeout, defaulting to V1');
      loadAdapter('v1');
    }
  };
  
  // Start polling - non-blocking
  setTimeout(poll, 100);
}

/**
 * Load the appropriate adapter
 */
function loadAdapter(version) {
  if (version === 'v2') {
    import('./adapter-v2.js')
      .then(({ initV2Adapter }) => {
        initV2Adapter();
        console.log('[BlockSpace] V2 adapter loaded');
      })
      .catch(err => {
        console.error('[BlockSpace] Failed to load V2 adapter:', err);
      });
  } else {
    import('./adapter-v1.js')
      .then(({ initV1Adapter }) => {
        initV1Adapter();
        console.log('[BlockSpace] V1 adapter loaded');
      })
      .catch(err => {
        console.error('[BlockSpace] Failed to load V1 adapter:', err);
      });
  }
}

/**
 * Manual detection check (for debugging)
 */
export function detectEnvironment() {
  return detectionResult || quickCheck() || 'unknown';
}

/**
 * Force load a specific adapter (for testing)
 */
export function forceLoadAdapter(version) {
  detectionResult = version;
  loadAdapter(version);
}

// Start detection immediately without blocking
// Use requestIdleCallback if available, otherwise setTimeout
if (typeof window !== 'undefined') {
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => startDetectionPolling());
  } else {
    setTimeout(startDetectionPolling, 10);
  }
}

// Export for manual use
window.BlockSpaceDetect = detectEnvironment;
window.BlockSpaceForceLoad = forceLoadAdapter;
window.BlockSpaceVersion = BLOCKSPACE_VERSION;

export { BLOCKSPACE_VERSION, detectEnvironment, forceLoadAdapter };

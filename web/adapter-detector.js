/**
 * Environment Detector for ComfyUI V1/V2
 * Defaults to V1 immediately, switches to V2 if detected
 */

const BLOCKSPACE_VERSION = "2.0.0-adapter";

// Detection state
let currentAdapter = 'v1';
let v2Detected = false;

/**
 * Check for V2 DOM nodes (data-node-id attribute)
 * This is the definitive V2 marker
 */
function checkV2DOMNodes() {
  return document.querySelector('[data-node-id]') !== null;
}

/**
 * Load V1 adapter immediately (default)
 */
function loadV1Adapter() {
  import('./adapter-v1.js')
    .then(({ initV1Adapter }) => {
      initV1Adapter();
      console.log('[BlockSpace] V1 adapter loaded (default)');
    })
    .catch(err => {
      console.error('[BlockSpace] Failed to load V1 adapter:', err);
    });
}

/**
 * Switch to V2 adapter
 */
function switchToV2Adapter() {
  if (v2Detected) return; // Already switched
  v2Detected = true;
  currentAdapter = 'v2';
  
  console.log('[BlockSpace] V2 detected, switching adapter...');
  
  // TODO: In future, we might need to cleanup V1 adapter first
  // For now, just load V2 on top (V2 stub doesn't conflict)
  import('./adapter-v2.js')
    .then(({ initV2Adapter }) => {
      initV2Adapter();
      console.log('[BlockSpace] Switched to V2 adapter');
    })
    .catch(err => {
      console.error('[BlockSpace] Failed to load V2 adapter:', err);
    });
}

/**
 * Poll for V2 detection (V2 DOM renders async)
 */
function startV2DetectionPolling() {
  // Check immediately first
  if (checkV2DOMNodes()) {
    switchToV2Adapter();
    return;
  }
  
  const maxAttempts = 200; // 4 seconds total (20ms * 200)
  let attempts = 0;
  
  const poll = () => {
    attempts++;
    
    if (checkV2DOMNodes()) {
      switchToV2Adapter();
      return;
    }
    
    if (attempts < maxAttempts) {
      setTimeout(poll, 20);
    }
    // No timeout warning - V1 default is the expected behavior
  };
  
  setTimeout(poll, 20);
}

/**
 * Manual detection check (for debugging)
 */
function detectEnvironment() {
  return checkV2DOMNodes() ? 'v2' : currentAdapter;
}

/**
 * Force load a specific adapter (for testing)
 */
function forceLoadAdapter(version) {
  if (version === 'v2' && !v2Detected) {
    switchToV2Adapter();
  } else if (version === 'v1' && currentAdapter !== 'v1') {
    console.log('[BlockSpace] Forcing V1 adapter reload not implemented');
  }
}

// Initialize: Load V1 immediately, poll for V2 in background
if (typeof window !== 'undefined') {
  // V1 loads immediately - no delay
  loadV1Adapter();
  
  // V2 detection happens in background
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => startV2DetectionPolling());
  } else {
    setTimeout(startV2DetectionPolling, 10);
  }
}

// Export for manual use
window.BlockSpaceDetect = detectEnvironment;
window.BlockSpaceForceLoad = forceLoadAdapter;
window.BlockSpaceVersion = BLOCKSPACE_VERSION;

export { BLOCKSPACE_VERSION, detectEnvironment, forceLoadAdapter };

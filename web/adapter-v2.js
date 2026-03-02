/**
 * ComfyUI-Block-Space V2 Adapter
 * 
 * Stub implementation for Vue-based DOM interface (ComfyUI V2).
 * Full implementation pending V2 API stabilization.
 */

import {
  clampNumber,
  rangesOverlap,
  getNodeBounds,
  buildDimensionClusters,
  pickNearestMoveCluster,
  pickDirectionalCluster,
  getRaycastNeighbors,
  getSettingValue,
  getHSnapMargin,
  getVSnapMargin,
  getSnapThreshold,
  isSnappingEnabled,
  getMoveSnapStrength,
  getResizeSnapStrength,
  getMoveYSnapStrength,
  getDimensionTolerancePx,
  getHighlightEnabled,
  getHighlightColor,
  getFeedbackEnabled,
  getFeedbackPulseMs,
  getFeedbackColorX,
  getFeedbackColorY,
  getFeedbackColorXY,
} from './core-math.js';
import { onAnySettingChanged } from './settings-events.js';

const V2_ADAPTER_VERSION = "2.0.0-stub";

// V2 state
const V2State = {
  settingsUnsubscribe: null,
};

function handleSettingChange(settingId, value) {
  // In V2, settings are reactive via Vue, but we log for debugging
  // and trigger any non-Vue DOM updates if needed
  console.log('[BlockSpace V2] Setting changed:', settingId, '=', value);

  // TODO: When V2 API stabilizes, implement:
  // - Update Vue reactive state
  // - Trigger DOM guide updates
  // - Invalidate snap caches
}

/**
 * Initialize V2 Adapter
 * 
 * In V2, ComfyUI uses Vue components instead of LiteGraph canvas.
 * This stub logs a message and prepares the ground for full implementation.
 */
export function initV2Adapter() {
  console.log('[BlockSpace] V2 Adapter stub loaded (version:', V2_ADAPTER_VERSION, ')');
  console.log('[BlockSpace] V2 full support is not yet implemented');
  
  // TODO: Implement V2 integration when API stabilizes
  // - Listen to Vue store for node changes
  // - Use DOM MutationObserver for node tracking
  // - Apply snapping via CSS transforms or Vue reactivity
  // - Render guides as DOM overlays
  
  // For now, just expose the core math functions
  // so other extensions can use them
  exposeCoreMath();

  // Subscribe to setting changes for real-time updates
  // This will be useful when V2 is fully implemented
  V2State.settingsUnsubscribe = onAnySettingChanged(handleSettingChange);
  
  return true;
}

/**
 * Cleanup V2 Adapter
 */
export function cleanupV2Adapter() {
  console.log('[BlockSpace] V2 Adapter cleanup');
  
  // Unsubscribe from setting changes
  if (V2State.settingsUnsubscribe) {
    V2State.settingsUnsubscribe();
    V2State.settingsUnsubscribe = null;
  }
  
  // TODO: Remove event listeners, clean up DOM elements
}

/**
 * Expose core math functions for other V2 extensions
 */
function exposeCoreMath() {
  if (typeof window !== 'undefined') {
    window.BlockSpaceCoreMathV2 = {
      // Settings
      getSettingValue,
      getHSnapMargin,
      getVSnapMargin,
      getSnapThreshold,
      isSnappingEnabled,
      getMoveSnapStrength,
      getResizeSnapStrength,
      getMoveYSnapStrength,
      getDimensionTolerancePx,
      getHighlightEnabled,
      getHighlightColor,
      getFeedbackEnabled,
      getFeedbackPulseMs,
      getFeedbackColorX,
      getFeedbackColorY,
      getFeedbackColorXY,
      // Math
      clampNumber,
      rangesOverlap,
      // Geometry
      getNodeBounds,
      // Clustering
      buildDimensionClusters,
      pickNearestMoveCluster,
      pickDirectionalCluster,
      // Raycasting
      getRaycastNeighbors,
    };
  }
}

/**
 * Placeholder for future V2 node tracking
 */
export function trackV2Node(nodeId) {
  console.warn('[BlockSpace] trackV2Node not implemented');
}

/**
 * Placeholder for future V2 snap application
 */
export function applyV2Snap(nodeId, x, y) {
  console.warn('[BlockSpace] applyV2Snap not implemented');
}

export default {
  initV2Adapter,
  cleanupV2Adapter,
  trackV2Node,
  applyV2Snap,
  version: V2_ADAPTER_VERSION,
};

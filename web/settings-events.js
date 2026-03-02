/**
 * Settings Event Bus for Block Space
 * 
 * Provides pub/sub pattern for real-time settings updates.
 * Settings changes emit events that adapters listen to.
 */

const specificListeners = new Map(); // settingId -> Set(callbacks)
const globalListeners = new Set();   // callbacks for any setting change

/**
 * Emit a setting change event
 * @param {string} settingId - The setting ID (e.g., "BlockSpace.Snap.Enabled")
 * @param {any} value - The new value
 */
export function emitSettingChanged(settingId, value) {
  // Dispatch global custom event for cross-module communication
  window.dispatchEvent(new CustomEvent("blockspace:setting:changed", {
    detail: { settingId, value },
    bubbles: false,
  }));

  // Notify specific listeners for this setting
  specificListeners.get(settingId)?.forEach((cb) => {
    try {
      cb(value);
    } catch (e) {
      console.error(`[BlockSpace] Error in setting listener for ${settingId}:`, e);
    }
  });

  // Notify global listeners
  globalListeners.forEach((cb) => {
    try {
      cb(settingId, value);
    } catch (e) {
      console.error("[BlockSpace] Error in global setting listener:", e);
    }
  });
}

/**
 * Subscribe to changes for a specific setting
 * @param {string} settingId - The setting ID to listen for
 * @param {(value: any) => void} callback - Called when the setting changes
 * @returns {() => void} Unsubscribe function
 */
export function onSettingChanged(settingId, callback) {
  if (!specificListeners.has(settingId)) {
    specificListeners.set(settingId, new Set());
  }
  specificListeners.get(settingId).add(callback);

  // Return unsubscribe function
  return () => {
    specificListeners.get(settingId)?.delete(callback);
  };
}

/**
 * Subscribe to all setting changes
 * @param {(settingId: string, value: any) => void} callback - Called when any setting changes
 * @returns {() => void} Unsubscribe function
 */
export function onAnySettingChanged(callback) {
  globalListeners.add(callback);

  // Return unsubscribe function
  return () => {
    globalListeners.delete(callback);
  };
}

/**
 * Convenience: Subscribe to multiple settings at once
 * @param {string[]} settingIds - Array of setting IDs
 * @param {(settingId: string, value: any) => void} callback - Called when any of the settings change
 * @returns {() => void} Unsubscribe function
 */
export function onSettingsChanged(settingIds, callback) {
  const unsubscribes = settingIds.map((id) => onSettingChanged(id, (value) => callback(id, value)));
  return () => unsubscribes.forEach((unsub) => unsub());
}

/**
 * Get current number of active listeners (for debugging)
 * @returns {{specific: number, global: number}}
 */
export function getListenerCount() {
  let specific = 0;
  specificListeners.forEach((set) => {
    specific += set.size;
  });
  return { specific, global: globalListeners.size };
}

/**
 * Clear all listeners (useful for testing or cleanup)
 */
export function clearAllListeners() {
  specificListeners.clear();
  globalListeners.clear();
}

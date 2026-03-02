/**
 * BlockSpace Extension - Main Entry Point
 * Non-blocking initialization with automatic V1/V2 detection
 */

// Re-export detector functions
export { detectEnvironment, forceLoadAdapter, BLOCKSPACE_VERSION } from './adapter-detector.js';

// Trigger detector load (non-blocking)
import('./adapter-detector.js');

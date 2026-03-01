/**
 * BlockSpace Extension - Main Entry Point
 * Uses adapter-detector to load the correct adapter for V1 or V2
 */

export { initBlockSpace, BLOCKSPACE_VERSION } from './adapter-detector.js';

// Auto-import and initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Delay to ensure DOM is settled (especially important for V2)
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const { initBlockSpace } = await import('./adapter-detector.js');
  initBlockSpace();
});

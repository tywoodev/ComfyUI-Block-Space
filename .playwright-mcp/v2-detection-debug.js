/**
 * Playwright script to debug V2 detection
 * 
 * This script will:
 * 1. Open ComfyUI
 * 2. Check current mode (V1/V2)
 * 3. Toggle V2 mode if needed
 * 4. Inspect DOM and console logs
 */

const { chromium } = require('playwright');

async function debugV2Detection() {
  console.log('Starting V2 detection debug...\n');
  
  const browser = await chromium.launch({
    headless: false,  // Show browser so we can see what's happening
    devtools: true,   // Open DevTools automatically
  });
  
  const page = await browser.newPage();
  
  // Listen to console logs
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[BlockSpace]')) {
      console.log('🟦 BlockSpace:', text);
    }
  });
  
  // Navigate to ComfyUI
  console.log('Navigating to ComfyUI...');
  await page.goto('http://127.0.0.1:8188', { waitUntil: 'networkidle' });
  
  // Wait for ComfyUI to load
  console.log('Waiting for ComfyUI to load...');
  await page.waitForTimeout(3000);
  
  // Check current environment
  console.log('\n📊 Checking current environment...');
  const envInfo = await page.evaluate(() => {
    return {
      hasLGraphCanvas: typeof window.LGraphCanvas !== 'undefined',
      hasComfyAPI: typeof window.comfyAPI !== 'undefined',
      frontendVersion: window.__COMFYUI_FRONTEND_VERSION__,
      hasExtensionManager: !!window.app?.extensionManager?.setting?.get,
      v2DOMElements: document.querySelectorAll('[data-node-id]').length,
      canvasElements: document.querySelectorAll('canvas').length,
      sampleNodeIds: Array.from(document.querySelectorAll('[data-node-id]')).slice(0, 3).map(el => el.getAttribute('data-node-id')),
    };
  });
  
  console.log('Environment info:', envInfo);
  
  // Check BlockSpace detection
  console.log('\n🔍 Checking BlockSpace detection result...');
  const blockSpaceEnv = await page.evaluate(() => {
    // Run the detection function
    const hasV2DOM = document.querySelector('[data-node-id]') !== null;
    return {
      hasV2DOM,
      wouldDetectAs: hasV2DOM ? 'v2' : 'v1',
    };
  });
  
  console.log('BlockSpace would detect as:', blockSpaceEnv.wouldDetectAs);
  
  console.log('\n✅ Debug setup complete!');
  console.log('You can now:');
  console.log('1. Check the console logs in DevTools');
  console.log('2. Toggle V2 mode in Settings');
  console.log('3. Refresh and see the detection change');
  console.log('\nTo toggle V2 mode:');
  console.log('- Open Settings (gear icon)');
  console.log('- Look for "Modern Node Design (Nodes 2.0)"');
  console.log('- Toggle it ON/OFF');
  console.log('- Watch the console for BlockSpace detection');
  
  // Keep browser open for interactive debugging
  console.log('\n🛑 Browser will stay open. Press Ctrl+C to close.');
  
  // Set up a way to re-check after manual toggle
  await page.exposeFunction('recheckEnvironment', async () => {
    console.log('\n🔄 Rechecking environment...');
    const newEnvInfo = await page.evaluate(() => {
      return {
        hasLGraphCanvas: typeof window.LGraphCanvas !== 'undefined',
        hasComfyAPI: typeof window.comfyAPI !== 'undefined',
        frontendVersion: window.__COMFYUI_FRONTEND_VERSION__,
        hasExtensionManager: !!window.app?.extensionManager?.setting?.get,
        v2DOMElements: document.querySelectorAll('[data-node-id]').length,
        canvasElements: document.querySelectorAll('canvas').length,
      };
    });
    console.log('New environment info:', newEnvInfo);
    return newEnvInfo;
  });
  
  // Expose function to check DOM
  await page.exposeFunction('inspectDOM', async () => {
    console.log('\n🔍 Inspecting DOM...');
    const domInfo = await page.evaluate(() => {
      const v2Nodes = document.querySelectorAll('[data-node-id]');
      const canvases = document.querySelectorAll('canvas');
      return {
        v2NodeCount: v2Nodes.length,
        canvasCount: canvases.length,
        sampleV2Nodes: Array.from(v2Nodes).slice(0, 3).map(el => ({
          id: el.getAttribute('data-node-id'),
          tagName: el.tagName,
          className: el.className,
        })),
        bodyChildren: document.body.children.length,
      };
    });
    console.log('DOM inspection:', domInfo);
    return domInfo;
  });
  
  // Wait indefinitely
  await new Promise(() => {});
}

// Run the debug script
debugV2Detection().catch(console.error);

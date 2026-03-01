import { app } from "/scripts/app.js";

const ASSET_VERSION = "2026-03-01-adapter-v2";

function addSetting(definition) {
  const settings = app && app.ui && app.ui.settings;
  if (!settings || typeof settings.addSetting !== "function") {
    return;
  }
  try {
    settings.addSetting(definition);
  } catch (error) {
    // Ignore per-setting registration errors
  }
}

function getSettingValue(id, fallback) {
  const settings = app && app.ui && app.ui.settings;
  if (!settings || typeof settings.getSettingValue !== "function") {
    return fallback;
  }
  try {
    const value = settings.getSettingValue(id);
    return value == null ? fallback : value;
  } catch (error) {
    return fallback;
  }
}

function applyConnectorSettings() {
  const isEnabled = getSettingValue("BlockSpace.EnableCustomConnectors", true);
  const connectorStyle = getSettingValue("BlockSpace.ConnectorStyle", "hybrid");
  const stubLength = getSettingValue("BlockSpace.ConnectorStubLength", 34);
  
  // Update connection-focus.js settings
  if (!window.ConnectionFocusSettings) {
    window.ConnectionFocusSettings = {};
  }
  window.ConnectionFocusSettings.enabled = isEnabled;
  window.ConnectionFocusSettings.connectorStyle = connectorStyle;
  window.ConnectionFocusSettings.connectorStubLength = stubLength;
}

function registerBlockSpaceSettings() {
  // --- Section: Connectors ---
  addSetting({
    id: "BlockSpace.EnableCustomConnectors",
    name: "Enable Custom Connectors",
    type: "boolean",
    defaultValue: true,
    onChange: applyConnectorSettings,
    tooltip: "Toggle high-fidelity connector rendering with animated flow tracing.",
  });
  
  addSetting({
    id: "BlockSpace.ConnectorStyle",
    name: "Connector Style",
    type: "combo",
    options: ["hybrid", "straight", "angled"],
    defaultValue: "hybrid",
    onChange: applyConnectorSettings,
    tooltip: "Choose the routing algorithm for node wires. Hybrid is recommended for most workflows.",
  });

  addSetting({
    id: "BlockSpace.ConnectorStubLength",
    name: "Connector Stub Length",
    type: "slider",
    attrs: { min: 10, max: 80, step: 1 },
    defaultValue: 34,
    onChange: applyConnectorSettings,
    tooltip: "Adjust the length of the straight wire segment emerging from node ports.",
  });

  // --- Section: Snapping ---
  addSetting({
    id: "BlockSpace.Snap.Enabled",
    name: "Enable Snapping",
    type: "boolean",
    defaultValue: true,
    tooltip: "Enable automatic node alignment and resizing guides.",
  });

  addSetting({
    id: "BlockSpace.Snap.Sensitivity",
    name: "Snap Sensitivity (px)",
    type: "slider",
    attrs: { min: 4, max: 30, step: 1 },
    defaultValue: 10,
    tooltip: "The distance in pixels at which nodes will pull into alignment.",
  });

  addSetting({
    id: "BlockSpace.Snap.HMarginPx",
    name: "Horizontal Snap Margin",
    type: "slider",
    attrs: { min: 0, max: 200, step: 2 },
    defaultValue: 60,
    tooltip: "The preferred gap distance when snapping nodes side-by-side.",
  });

  addSetting({
    id: "BlockSpace.Snap.VMarginPx",
    name: "Vertical Snap Margin",
    type: "slider",
    attrs: { min: 0, max: 200, step: 2 },
    defaultValue: 60,
    tooltip: "The preferred gap distance when snapping nodes vertically.",
  });

  addSetting({
    id: "BlockSpace.Snap.HighlightEnabled",
    name: "Show Alignment Guides",
    type: "boolean",
    defaultValue: true,
    tooltip: "Display dotted lines showing exactly which nodes are being used for alignment.",
  });

  // --- Section: Visuals ---
  addSetting({
    id: "BlockSpace.Snap.FeedbackPulseMs",
    name: "Snap Pulse Duration (ms)",
    type: "slider",
    attrs: { min: 0, max: 1000, step: 20 },
    defaultValue: 160,
    tooltip: "How long the node border glows after a successful snap. Set to 0 to disable.",
  });

  addSetting({
    id: "BlockSpace.Snap.HighlightColor",
    name: "Guide Line Color",
    type: "combo",
    options: [
      "Comfy Blue",
      "Cyber Purple",
      "Neon Green",
      "Hot Pink",
      "Ghost White",
      "Amber Gold",
      "Signal Orange",
    ],
    defaultValue: "Comfy Blue",
    tooltip: "Choose the color for snapping alignment guides.",
  });
  
  applyConnectorSettings();
}

function injectSettingsIcon() {
  const styleId = "block-space-icon-style";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.innerHTML = `
      .block-space-nav-icon {
        display: inline-block;
        vertical-align: text-bottom;
        margin-right: 8px;
        width: 18px;
        height: 18px;
      }
      /* Change cursor to question mark for help icons in our settings */
      .comfy-setting-row:has([id^="BlockSpace."]) .comfy-help-icon,
      tr:has([id^="BlockSpace."]) .comfy-help-icon {
        cursor: help !important;
      }
    `;
    document.head.appendChild(style);
  }

  const svgIcon = `
    <svg class="block-space-nav-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 4H10V10H4V4Z" fill="#57b1ff" rx="1"/>
      <path d="M14 14H20V20H14V14Z" fill="#8dff57" rx="1"/>
      <path d="M14 4H20V10H14V4Z" fill="transparent" rx="1" stroke="#57b1ff" stroke-width="2"/>
      <path d="M4 14H10V20H4V14Z" fill="transparent" rx="1" stroke="#8dff57" stroke-width="2"/>
      <line x1="10" y1="10" x2="14" y2="14" stroke="#b57cff" stroke-width="2" stroke-linecap="round" stroke-dasharray="2 3"/>
    </svg>
  `;

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1) {
          // --- Logic 1: Better Node Labeling ---
          const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null, false);
          let n;
          while ((n = walker.nextNode())) {
            const text = n.nodeValue ? n.nodeValue.trim() : "";
            if (text === "BlockSpace" || text === "BlockSpace.Snap") {
              n.nodeValue = " Block Space";
              const parentElement = n.parentElement;
              if (parentElement && !parentElement.querySelector('.block-space-nav-icon')) {
                parentElement.insertAdjacentHTML('afterbegin', svgIcon);
              }
            }
          }
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

async function loadScript(url, options = {}) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.async = false;
    if (options.type) {
      script.type = options.type;
    }
    script.onload = () => resolve(url);
    script.onerror = () => reject(new Error("Failed to load script: " + url));
    document.body.appendChild(script);
  });
}

// Legacy fallback: load individual scripts (original behavior)
async function loadLegacyScripts(baseUrl) {
  console.warn("[BlockSpace] Loading legacy scripts as fallback");
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

// New modular loading: load index.js as ES module
async function loadBlockSpaceAdapter(baseUrl) {
  const indexUrl = new URL("../../index.js", baseUrl).toString() + "?v=" + ASSET_VERSION;
  
  // Load as ES module
  await loadScript(indexUrl, { type: "module" });
  
  // Wait for BlockSpace to initialize
  // The index.js will auto-initialize, but we expose BlockSpaceInit for manual control
  if (window.BlockSpaceInit) {
    await window.BlockSpaceInit();
  } else {
    // If BlockSpaceInit is not available, wait a bit for module to load
    await new Promise(resolve => setTimeout(resolve, 100));
    if (window.BlockSpaceInit) {
      await window.BlockSpaceInit();
    } else {
      throw new Error("BlockSpaceInit not available after loading index.js");
    }
  }
}

app.registerExtension({
  name: "Block Space",
  async setup() {
    // Load BetterNodesSettings (still needed for settings store)
    await loadScript(new URL("../../better-nodes-settings.js", import.meta.url).toString() + "?v=" + ASSET_VERSION);

    if (window.BetterNodesSettings && typeof window.BetterNodesSettings.__setComfyUIRuntime === "function") {
      window.BetterNodesSettings.__setComfyUIRuntime(true);
    }

    // Try new modular loading first, fallback to legacy on failure
    try {
      await loadBlockSpaceAdapter(import.meta.url);
      console.log("[BlockSpace] Adapter loaded successfully");
    } catch (error) {
      console.error("[BlockSpace] Failed to load adapter:", error);
      console.warn("[BlockSpace] Falling back to legacy script loading");
      await loadLegacyScripts(import.meta.url);
    }

    // Reset persisted highlights (backward compatibility)
    if (
      window.BlockSpaceNodeSnap &&
      typeof window.BlockSpaceNodeSnap.resetPersistedHighlightArtifacts === "function"
    ) {
      window.BlockSpaceNodeSnap.resetPersistedHighlightArtifacts(app && app.canvas);
    }

    registerBlockSpaceSettings();
    injectSettingsIcon();
  },
});

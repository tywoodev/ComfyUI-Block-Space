import { app } from "/scripts/app.js";

const ASSET_VERSION = "2026-03-01-adapter-v2";

function addSetting(definition) {
  const add = app?.ui?.settings?.addSetting;
  if (typeof add !== "function") return;
  try {
    add(definition);
  } catch {
    // Ignore per-setting registration errors
  }
}

function getSettingValue(id, fallback) {
  const get = app?.ui?.settings?.getSettingValue;
  if (typeof get !== "function") return fallback;
  try {
    return get(id) ?? fallback;
  } catch {
    return fallback;
  }
}

function applyConnectorSettings() {
  window.ConnectionFocusSettings ??= {};
  window.ConnectionFocusSettings.enabled = getSettingValue("BlockSpace.EnableCustomConnectors", true);
  window.ConnectionFocusSettings.connectorStyle = getSettingValue("BlockSpace.ConnectorStyle", "hybrid");
  window.ConnectionFocusSettings.connectorStubLength = getSettingValue("BlockSpace.ConnectorStubLength", 34);
}

function registerBlockSpaceSettings() {
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

  addSetting({
    id: "BlockSpace.Snap.Enabled",
    name: "Enable Snapping",
    type: "boolean",
    defaultValue: true,
    tooltip: "Enable automatic node alignment and resizing guides.",
  });

  addSetting({
    id: "BlockSpace.Snap.Aggressiveness",
    name: "Snap Aggressiveness",
    type: "combo",
    options: ["Low", "Medium", "High"],
    defaultValue: "Medium",
    tooltip: "Controls how strongly nodes snap to alignment. Low = easier free movement, High = stronger snapping.",
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

function loadBlockSpaceAdapter(baseUrl) {
  const indexUrl = new URL("../../index.js", baseUrl).toString() + "?v=" + ASSET_VERSION;
  
  // Non-blocking script load
  const script = document.createElement("script");
  script.src = indexUrl;
  script.type = "module";
  script.async = true; // Non-blocking
  script.onload = () => {
    console.log("[BlockSpace] Module loaded, adapter will auto-initialize");
  };
  script.onerror = () => {
    console.error("[BlockSpace] Failed to load module. Try hard refresh (Ctrl+F5)");
  };
  document.head.appendChild(script);
}

app.registerExtension({
  name: "Block Space",
  setup() {
    // Load settings script (non-blocking)
    const settingsUrl = new URL("../../better-nodes-settings.js", import.meta.url).toString() + "?v=" + ASSET_VERSION;
    const settingsScript = document.createElement("script");
    settingsScript.src = settingsUrl;
    settingsScript.async = true;
    settingsScript.onload = () => {
      if (window.BetterNodesSettings && typeof window.BetterNodesSettings.__setComfyUIRuntime === "function") {
        window.BetterNodesSettings.__setComfyUIRuntime(true);
      }
    };
    document.head.appendChild(settingsScript);

    // Load adapter (non-blocking, auto-detects V1/V2)
    loadBlockSpaceAdapter(import.meta.url);

    // Reset any persisted artifacts from previous sessions
    setTimeout(() => {
      if (
        window.BlockSpaceNodeSnap &&
        typeof window.BlockSpaceNodeSnap.resetPersistedHighlightArtifacts === "function"
      ) {
        window.BlockSpaceNodeSnap.resetPersistedHighlightArtifacts(app && app.canvas);
      }
    }, 1000);

    registerBlockSpaceSettings();
    injectSettingsIcon();
  },
});

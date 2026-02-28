import { app } from "/scripts/app.js";

const ASSET_VERSION = "2026-02-27-resize-margin-fix";

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
  
  // Update connection-focus.js settings
  if (!window.ConnectionFocusSettings) {
    window.ConnectionFocusSettings = {};
  }
  window.ConnectionFocusSettings.enableAngled = isEnabled;
  window.ConnectionFocusSettings.enableHybrid = isEnabled;
  window.ConnectionFocusSettings.enableStraight = isEnabled;
  window.ConnectionFocusSettings.connectorStyle = connectorStyle;
}

function registerBlockSpaceSettings() {
  // Toggle to enable/disable custom connectors
  addSetting({
    id: "BlockSpace.EnableCustomConnectors",
    name: "Enable Custom Connectors",
    type: "boolean",
    defaultValue: true,
    onChange: applyConnectorSettings,
  });
  
  // Dropdown to select connector style
  addSetting({
    id: "BlockSpace.ConnectorStyle",
    name: "Connector Style",
    type: "combo",
    options: ["hybrid", "straight", "angled"],
    defaultValue: "hybrid",
    onChange: applyConnectorSettings,
  });
  
  // Apply initial setting
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
            if (text === "BlockSpace") {
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

async function loadScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.async = false;
    script.onload = () => resolve(url);
    script.onerror = () => reject(new Error("Failed to load script: " + url));
    document.body.appendChild(script);
  });
}

async function ensureRuntimeScriptsLoaded(baseUrl) {
  const scripts = [
    "../../smart-drop.js",
    "../../smart-sizing.js",
    "../../connection-focus.js",
    "../../node-snapping.js",
  ];
  for (const rel of scripts) {
    const url = new URL(rel, baseUrl).toString() + "?v=" + ASSET_VERSION;
    await loadScript(url);
  }
}

app.registerExtension({
  name: "Block Space",
  async setup() {
    await loadScript(new URL("../../better-nodes-settings.js", import.meta.url).toString() + "?v=" + ASSET_VERSION);

    if (window.BetterNodesSettings && typeof window.BetterNodesSettings.__setComfyUIRuntime === "function") {
      window.BetterNodesSettings.__setComfyUIRuntime(true);
    }

    await ensureRuntimeScriptsLoaded(import.meta.url);

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

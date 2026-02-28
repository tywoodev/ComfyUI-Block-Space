import { app } from "/scripts/app.js";

const ASSET_VERSION = "2026-02-27-settings-expansion-v1";

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
  });
  
  addSetting({
    id: "BlockSpace.ConnectorStyle",
    name: "Connector Style",
    type: "combo",
    options: ["hybrid", "straight", "angled"],
    defaultValue: "hybrid",
    onChange: applyConnectorSettings,
  });

  addSetting({
    id: "BlockSpace.ConnectorStubLength",
    name: "Connector Stub Length",
    type: "slider",
    attrs: { min: 10, max: 80, step: 1 },
    defaultValue: 34,
    onChange: applyConnectorSettings,
  });

  // --- Section: Snapping ---
  addSetting({
    id: "BlockSpace.Snap.Enabled",
    name: "Enable Snapping",
    type: "boolean",
    defaultValue: true,
  });

  addSetting({
    id: "BlockSpace.Snap.Sensitivity",
    name: "Snap Sensitivity (px)",
    type: "slider",
    attrs: { min: 4, max: 30, step: 1 },
    defaultValue: 10,
  });

  addSetting({
    id: "BlockSpace.Snap.HMarginPx",
    name: "Horizontal Snap Margin",
    type: "slider",
    attrs: { min: 0, max: 200, step: 2 },
    defaultValue: 60,
  });

  addSetting({
    id: "BlockSpace.Snap.VMarginPx",
    name: "Vertical Snap Margin",
    type: "slider",
    attrs: { min: 0, max: 200, step: 2 },
    defaultValue: 60,
  });

  addSetting({
    id: "BlockSpace.Snap.HighlightEnabled",
    name: "Show Alignment Guides",
    type: "boolean",
    defaultValue: true,
  });

  // --- Section: Visuals ---
  addSetting({
    id: "BlockSpace.Snap.FeedbackPulseMs",
    name: "Snap Pulse Duration (ms)",
    type: "slider",
    attrs: { min: 0, max: 1000, step: 20 },
    defaultValue: 160,
  });

  addSetting({
    id: "BlockSpace.Snap.HighlightColor",
    name: "Guide Line Color",
    type: "text",
    defaultValue: "#1a3a6b",
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
      .block-space-color-swatch {
        width: 32px;
        height: 20px;
        border-radius: 4px;
        border: 1px solid rgba(255,255,255,0.2);
        display: inline-block;
        vertical-align: middle;
        margin-left: 8px;
        cursor: pointer;
        background: #000;
        box-shadow: 0 0 0 1px rgba(0,0,0,0.5);
        transition: transform 0.1s ease, border-color 0.1s ease;
      }
      .block-space-color-swatch:hover {
        transform: scale(1.1);
        border-color: rgba(255,255,255,0.5);
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

          // --- Logic 2: Robust Color Picker Injection ---
          // Search for any element containing our specific label text
          const labels = Array.from(node.querySelectorAll('label, span, div')).filter(el => 
            el.textContent.trim() === 'Guide Line Color' && el.children.length === 0
          );

          labels.forEach(label => {
            // Find the container (usually a table row or a flex div)
            const container = label.closest('tr, .comfy-setting-row, div');
            if (!container) return;

            const input = container.querySelector('input[type="text"]');
            if (!input || container.querySelector('.block-space-color-swatch')) return;

            const swatch = document.createElement('div');
            swatch.className = 'block-space-color-swatch';
            swatch.title = 'Click to open color picker';
            swatch.style.backgroundColor = input.value;
            
            const picker = document.createElement('input');
            picker.type = 'color';
            picker.style.display = 'none';
            picker.value = input.value;

            swatch.onclick = (e) => {
              e.preventDefault();
              e.stopPropagation();
              picker.click();
            };

            picker.oninput = (e) => {
              const color = e.target.value;
              input.value = color;
              swatch.style.backgroundColor = color;
              // Trigger both events to ensure ComfyUI saves the change
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
            };

            input.after(swatch);
            input.after(picker);
          });
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

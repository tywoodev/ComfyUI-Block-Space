import { app } from "/scripts/app.js";

const ASSET_VERSION = "2026-02-27-comfyui-node-snapping-v4";

const CONNECTOR_DEFAULTS = {
  flowColor: "#ff00ae",
  preferredStyle: "hybrid",
  enableHybrid: true,
  enableStraight: true,
  enableAngled: true,
};

const NODE_SNAP_DEFAULTS = {
  hMarginPx: 60,
  vMarginPx: 60,
  moveStrength: 1.0,
  moveYSnapStrength: 2.4,
  resizeStrength: 1.8,
  dimensionTolerancePx: 12,
  highlightEnabled: true,
  highlightColor: "#57b1ff",
  highlightWidth: 3,
  feedbackEnabled: true,
  feedbackPulseMs: 160,
  feedbackBadgeMs: 260,
  feedbackBadgeCooldownMs: 200,
  feedbackColorX: "#57b1ff",
  feedbackColorY: "#8dff57",
  feedbackColorXY: "#b57cff",
  feedbackBadgeBg: "#0f172a",
  feedbackBadgeText: "#e5f1ff",
};

function asBool(value, fallback) {
  if (value == null) {
    return !!fallback;
  }
  return !!value;
}

function asNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asColor(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }
  const v = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v) || /^#[0-9a-fA-F]{3}$/.test(v)) {
    return v;
  }
  return fallback;
}

function asStyle(value, fallback) {
  if (value === "hybrid" || value === "straight" || value === "angled") {
    return value;
  }
  return fallback;
}

function getSettingValue(id, fallback) {
  const settings = app && app.ui && app.ui.settings;
  if (!settings) {
    return fallback;
  }
  if (typeof settings.getSettingValue === "function") {
    try {
      const value = settings.getSettingValue(id);
      return value == null ? fallback : value;
    } catch (error) {
      return fallback;
    }
  }
  return fallback;
}

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

function hasSettingValue(id) {
  const value = getSettingValue(id, null);
  return value != null;
}

function setSettingValue(id, value) {
  const settings = app && app.ui && app.ui.settings;
  if (!settings) {
    return false;
  }
  try {
    if (typeof settings.setSettingValue === "function") {
      settings.setSettingValue(id, value);
      return true;
    }
  } catch (error) {
    return false;
  }
  return false;
}

function migrateLegacyNodeSnapMargin() {
  const legacyId = "comfyuiBlockSpace.nodeSnap.marginPx";
  const hId = "comfyuiBlockSpace.nodeSnap.hMarginPx";
  const vId = "comfyuiBlockSpace.nodeSnap.vMarginPx";

  if (!hasSettingValue(legacyId)) {
    return;
  }

  const legacyValue = asNumber(getSettingValue(legacyId, NODE_SNAP_DEFAULTS.hMarginPx), NODE_SNAP_DEFAULTS.hMarginPx);
  const hasH = hasSettingValue(hId);
  const hasV = hasSettingValue(vId);

  if (!hasH) {
    setSettingValue(hId, legacyValue);
  }
  if (!hasV) {
    setSettingValue(vId, legacyValue);
  }
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

function getConnectorSettings() {
  return {
    pulseColor: asColor(
      getSettingValue("comfyuiBlockSpace.connector.flowColor", CONNECTOR_DEFAULTS.flowColor),
      CONNECTOR_DEFAULTS.flowColor
    ),
    connectorStyle: asStyle(
      getSettingValue("comfyuiBlockSpace.connector.preferredStyle", CONNECTOR_DEFAULTS.preferredStyle),
      CONNECTOR_DEFAULTS.preferredStyle
    ),
    enableHybrid: asBool(
      getSettingValue("comfyuiBlockSpace.connector.enableHybrid", CONNECTOR_DEFAULTS.enableHybrid),
      CONNECTOR_DEFAULTS.enableHybrid
    ),
    enableStraight: asBool(
      getSettingValue("comfyuiBlockSpace.connector.enableStraight", CONNECTOR_DEFAULTS.enableStraight),
      CONNECTOR_DEFAULTS.enableStraight
    ),
    enableAngled: asBool(
      getSettingValue("comfyuiBlockSpace.connector.enableAngled", CONNECTOR_DEFAULTS.enableAngled),
      CONNECTOR_DEFAULTS.enableAngled
    ),
  };
}

function applyConnectorSettings() {
  if (typeof window.setConnectionFocusSettings !== "function") {
    return;
  }
  const settings = getConnectorSettings();
  window.setConnectionFocusSettings(settings);
  if (window.BetterNodesSettings) {
    window.BetterNodesSettings.set("comfyuiBlockSpace.connector", settings);
  }
}

function applyNodeSnapSettings() {
  if (window.BetterNodesSettings) {
    window.BetterNodesSettings.set("comfyuiBlockSpace.nodeSnap", {
      hMarginPx: asNumber(getSettingValue("comfyuiBlockSpace.nodeSnap.hMarginPx", NODE_SNAP_DEFAULTS.hMarginPx), NODE_SNAP_DEFAULTS.hMarginPx),
      vMarginPx: asNumber(getSettingValue("comfyuiBlockSpace.nodeSnap.vMarginPx", NODE_SNAP_DEFAULTS.vMarginPx), NODE_SNAP_DEFAULTS.vMarginPx),
      moveStrength: asNumber(getSettingValue("comfyuiBlockSpace.nodeSnap.moveStrength", NODE_SNAP_DEFAULTS.moveStrength), NODE_SNAP_DEFAULTS.moveStrength),
      moveYSnapStrength: asNumber(getSettingValue("comfyuiBlockSpace.nodeSnap.moveYSnapStrength", NODE_SNAP_DEFAULTS.moveYSnapStrength), NODE_SNAP_DEFAULTS.moveYSnapStrength),
      resizeStrength: asNumber(getSettingValue("comfyuiBlockSpace.nodeSnap.resizeStrength", NODE_SNAP_DEFAULTS.resizeStrength), NODE_SNAP_DEFAULTS.resizeStrength),
      dimensionTolerancePx: asNumber(getSettingValue("comfyuiBlockSpace.nodeSnap.dimensionTolerancePx", NODE_SNAP_DEFAULTS.dimensionTolerancePx), NODE_SNAP_DEFAULTS.dimensionTolerancePx),
      highlightEnabled: asBool(getSettingValue("comfyuiBlockSpace.nodeSnap.highlightEnabled", NODE_SNAP_DEFAULTS.highlightEnabled), NODE_SNAP_DEFAULTS.highlightEnabled),
      highlightColor: asColor(getSettingValue("comfyuiBlockSpace.nodeSnap.highlightColor", NODE_SNAP_DEFAULTS.highlightColor), NODE_SNAP_DEFAULTS.highlightColor),
      highlightWidth: asNumber(getSettingValue("comfyuiBlockSpace.nodeSnap.highlightWidth", NODE_SNAP_DEFAULTS.highlightWidth), NODE_SNAP_DEFAULTS.highlightWidth),
      feedbackEnabled: asBool(getSettingValue("comfyuiBlockSpace.nodeSnap.feedbackEnabled", NODE_SNAP_DEFAULTS.feedbackEnabled), NODE_SNAP_DEFAULTS.feedbackEnabled),
      feedbackPulseMs: asNumber(getSettingValue("comfyuiBlockSpace.nodeSnap.feedbackPulseMs", NODE_SNAP_DEFAULTS.feedbackPulseMs), NODE_SNAP_DEFAULTS.feedbackPulseMs),
      feedbackBadgeMs: asNumber(getSettingValue("comfyuiBlockSpace.nodeSnap.feedbackBadgeMs", NODE_SNAP_DEFAULTS.feedbackBadgeMs), NODE_SNAP_DEFAULTS.feedbackBadgeMs),
      feedbackBadgeCooldownMs: asNumber(getSettingValue("comfyuiBlockSpace.nodeSnap.feedbackBadgeCooldownMs", NODE_SNAP_DEFAULTS.feedbackBadgeCooldownMs), NODE_SNAP_DEFAULTS.feedbackBadgeCooldownMs),
      feedbackColorX: asColor(getSettingValue("comfyuiBlockSpace.nodeSnap.feedbackColorX", NODE_SNAP_DEFAULTS.feedbackColorX), NODE_SNAP_DEFAULTS.feedbackColorX),
      feedbackColorY: asColor(getSettingValue("comfyuiBlockSpace.nodeSnap.feedbackColorY", NODE_SNAP_DEFAULTS.feedbackColorY), NODE_SNAP_DEFAULTS.feedbackColorY),
      feedbackColorXY: asColor(getSettingValue("comfyuiBlockSpace.nodeSnap.feedbackColorXY", NODE_SNAP_DEFAULTS.feedbackColorXY), NODE_SNAP_DEFAULTS.feedbackColorXY),
      feedbackBadgeBg: asColor(getSettingValue("comfyuiBlockSpace.nodeSnap.feedbackBadgeBg", NODE_SNAP_DEFAULTS.feedbackBadgeBg), NODE_SNAP_DEFAULTS.feedbackBadgeBg),
      feedbackBadgeText: asColor(getSettingValue("comfyuiBlockSpace.nodeSnap.feedbackBadgeText", NODE_SNAP_DEFAULTS.feedbackBadgeText), NODE_SNAP_DEFAULTS.feedbackBadgeText),
    });
  }
}

function hideStandaloneHudInComfyUI() {
  const hud = document.querySelector(".hud");
  if (hud) {
    hud.style.display = "none";
  }
}

function registerConnectorSettings() {
  const cat = ["comfyuiBlockSpace", "1. Connector Settings"];
  
  addSetting({
    id: "comfyuiBlockSpace.connector.flowColor",
    name: "Flow Color",
    category: cat,
    type: "text",
    defaultValue: CONNECTOR_DEFAULTS.flowColor,
    onChange: applyConnectorSettings,
  });
  addSetting({
    id: "comfyuiBlockSpace.connector.preferredStyle",
    name: "Preferred Style",
    category: cat,
    type: "combo",
    options: ["hybrid", "straight", "angled"],
    defaultValue: CONNECTOR_DEFAULTS.preferredStyle,
    onChange: applyConnectorSettings,
  });
  addSetting({
    id: "comfyuiBlockSpace.connector.enableHybrid",
    name: "Enable Hybrid Nodes",
    category: cat,
    type: "boolean",
    defaultValue: CONNECTOR_DEFAULTS.enableHybrid,
    onChange: applyConnectorSettings,
  });
  addSetting({
    id: "comfyuiBlockSpace.connector.enableStraight",
    name: "Enable Straight Nodes",
    category: cat,
    type: "boolean",
    defaultValue: CONNECTOR_DEFAULTS.enableStraight,
    onChange: applyConnectorSettings,
  });
  addSetting({
    id: "comfyuiBlockSpace.connector.enableAngled",
    name: "Enable Custom Connectors",
    category: cat,
    type: "boolean",
    defaultValue: CONNECTOR_DEFAULTS.enableAngled,
    onChange: applyConnectorSettings,
  });
}

function registerNodeSnapSettings() {
  const catCore = ["comfyuiBlockSpace", "2. Snapping Margins & Strength"];
  const catVisual = ["comfyuiBlockSpace", "3. Visual Guide Lines"];
  const catFeedback = ["comfyuiBlockSpace", "4. Snap Badges & Pulses"];

  // --- Core Math ---
  addSetting({
    id: "comfyuiBlockSpace.nodeSnap.hMarginPx",
    name: "Horizontal Gap Margin (px)",
    category: catCore,
    type: "number",
    defaultValue: NODE_SNAP_DEFAULTS.hMarginPx,
    onChange: applyNodeSnapSettings,
  });
  addSetting({
    id: "comfyuiBlockSpace.nodeSnap.vMarginPx",
    name: "Vertical Gap Margin (px)",
    category: catCore,
    type: "number",
    defaultValue: NODE_SNAP_DEFAULTS.vMarginPx,
    onChange: applyNodeSnapSettings,
  });
  addSetting({
    id: "comfyuiBlockSpace.nodeSnap.moveStrength",
    name: "X-Axis Snap Strength",
    category: catCore,
    type: "number",
    defaultValue: NODE_SNAP_DEFAULTS.moveStrength,
    onChange: applyNodeSnapSettings,
  });
  addSetting({
    id: "comfyuiBlockSpace.nodeSnap.moveYSnapStrength",
    name: "Y-Axis Snap Strength",
    category: catCore,
    type: "number",
    defaultValue: NODE_SNAP_DEFAULTS.moveYSnapStrength,
    onChange: applyNodeSnapSettings,
  });
  addSetting({
    id: "comfyuiBlockSpace.nodeSnap.resizeStrength",
    name: "Resize Snap Strength",
    category: catCore,
    type: "number",
    defaultValue: NODE_SNAP_DEFAULTS.resizeStrength,
    onChange: applyNodeSnapSettings,
  });
  addSetting({
    id: "comfyuiBlockSpace.nodeSnap.dimensionTolerancePx",
    name: "Cluster Tolerance (px)",
    category: catCore,
    type: "number",
    defaultValue: NODE_SNAP_DEFAULTS.dimensionTolerancePx,
    attrs: { min: 1, max: 64, step: 1 },
    onChange: applyNodeSnapSettings,
  });

  // --- Visual Guidelines ---
  addSetting({
    id: "comfyuiBlockSpace.nodeSnap.highlightEnabled",
    name: "Enable Alignment Lines",
    category: catVisual,
    type: "boolean",
    defaultValue: NODE_SNAP_DEFAULTS.highlightEnabled,
    onChange: applyNodeSnapSettings,
  });
  addSetting({
    id: "comfyuiBlockSpace.nodeSnap.highlightColor",
    name: "Line Color",
    category: catVisual,
    type: "text",
    defaultValue: NODE_SNAP_DEFAULTS.highlightColor,
    onChange: applyNodeSnapSettings,
  });
  addSetting({
    id: "comfyuiBlockSpace.nodeSnap.highlightWidth",
    name: "Line Width",
    category: catVisual,
    type: "number",
    defaultValue: NODE_SNAP_DEFAULTS.highlightWidth,
    onChange: applyNodeSnapSettings,
  });

  // --- Feedback ---
  addSetting({
    id: "comfyuiBlockSpace.nodeSnap.feedbackEnabled",
    name: "Enable Badges",
    category: catFeedback,
    type: "boolean",
    defaultValue: NODE_SNAP_DEFAULTS.feedbackEnabled,
    onChange: applyNodeSnapSettings,
  });
  addSetting({
    id: "comfyuiBlockSpace.nodeSnap.feedbackPulseMs",
    name: "Node Outline Pulse (ms)",
    category: catFeedback,
    type: "number",
    defaultValue: NODE_SNAP_DEFAULTS.feedbackPulseMs,
    onChange: applyNodeSnapSettings,
  });
  addSetting({
    id: "comfyuiBlockSpace.nodeSnap.feedbackBadgeMs",
    name: "Badge Display Time (ms)",
    category: catFeedback,
    type: "number",
    defaultValue: NODE_SNAP_DEFAULTS.feedbackBadgeMs,
    onChange: applyNodeSnapSettings,
  });
  addSetting({
    id: "comfyuiBlockSpace.nodeSnap.feedbackBadgeCooldownMs",
    name: "Badge Cooldown (ms)",
    category: catFeedback,
    type: "number",
    defaultValue: NODE_SNAP_DEFAULTS.feedbackBadgeCooldownMs,
    onChange: applyNodeSnapSettings,
  });
  addSetting({
    id: "comfyuiBlockSpace.nodeSnap.feedbackColorX",
    name: "X-Axis Color",
    category: catFeedback,
    type: "text",
    defaultValue: NODE_SNAP_DEFAULTS.feedbackColorX,
    onChange: applyNodeSnapSettings,
  });
  addSetting({
    id: "comfyuiBlockSpace.nodeSnap.feedbackColorY",
    name: "Y-Axis Color",
    category: catFeedback,
    type: "text",
    defaultValue: NODE_SNAP_DEFAULTS.feedbackColorY,
    onChange: applyNodeSnapSettings,
  });
  addSetting({
    id: "comfyuiBlockSpace.nodeSnap.feedbackColorXY",
    name: "Corner (XY) Color",
    category: catFeedback,
    type: "text",
    defaultValue: NODE_SNAP_DEFAULTS.feedbackColorXY,
    onChange: applyNodeSnapSettings,
  });
  addSetting({
    id: "comfyuiBlockSpace.nodeSnap.feedbackBadgeBg",
    name: "Badge Background",
    category: catFeedback,
    type: "text",
    defaultValue: NODE_SNAP_DEFAULTS.feedbackBadgeBg,
    onChange: applyNodeSnapSettings,
  });
  addSetting({
    id: "comfyuiBlockSpace.nodeSnap.feedbackBadgeText",
    name: "Badge Text Color",
    category: catFeedback,
    type: "text",
    defaultValue: NODE_SNAP_DEFAULTS.feedbackBadgeText,
    onChange: applyNodeSnapSettings,
  });
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

  // A sleek vector representing two nodes snapping together with a glowing threshold line
  const svgIcon = `
    <svg class="block-space-nav-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 4H10V10H4V4Z" fill="#57b1ff" rx="1"/>
      <path d="M14 14H20V20H14V14Z" fill="#8dff57" rx="1"/>
      <path d="M14 4H20V10H14V4Z" fill="transparent" rx="1" stroke="#57b1ff" stroke-width="2"/>
      <path d="M4 14H10V20H4V14Z" fill="transparent" rx="1" stroke="#8dff57" stroke-width="2"/>
      <line x1="10" y1="10" x2="14" y2="14" stroke="#b57cff" stroke-width="2" stroke-linecap="round" stroke-dasharray="2 3"/>
    </svg>
  `;

  // Silently watch for the ComfyUI Settings modal to open.
  // We look for the ugly internal ID "comfyuiBlockSpace" and instantly beautify it.
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1) { 
          const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null, false);
          let n;
          while ((n = walker.nextNode())) {
            const text = n.nodeValue ? n.nodeValue.trim() : "";
            if (text === "comfyuiBlockSpace") {
              n.nodeValue = " Block Space"; // Rename it in the DOM
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

    hideStandaloneHudInComfyUI();
    registerConnectorSettings();
    registerNodeSnapSettings();
    migrateLegacyNodeSnapMargin();
    applyConnectorSettings();
    applyNodeSnapSettings();
    
    injectSettingsIcon();
  },
});
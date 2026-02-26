import { app } from "/scripts/app.js";

const ASSET_VERSION = "2026-02-26-comfyui-node-snapping-phase-1-v25";

const CONNECTOR_DEFAULTS = {
  flowColor: "#ff00ae",
  preferredStyle: "hybrid",
  enableHybrid: true,
  enableStraight: true,
  enableAngled: true,
};

const GRID_DEFAULTS = {
  rowPadding: 28,
  rowTopPadding: 52,
  rowBottomPadding: 46,
  nodeVerticalGap: 40,
  borderJunctionGap: 6,
  gridLineWidth: 2,
  gridLineColor: "#ffffff",
  gridLineStyle: "solid",
  edgeToEdgeSnapGapPx: 20,
};

const NODE_SNAP_DEFAULTS = {
  hMarginPx: 60,
  vMarginPx: 60,
  moveStrength: 1.0,
  resizeStrength: 1.8,
  highlightEnabled: true,
  highlightColor: "#57b1ff",
  highlightWidth: 3,
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

function asDividerStyle(value, fallback) {
  if (value === "solid" || value === "dashed" || value === "dotted" || value === "double") {
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
    // Ignore per-setting registration errors to keep other settings visible.
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
    "../../smart-grid-container.js",
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

function getGridSettings() {
  return {
    rowPadding: asNumber(
      getSettingValue("comfyuiBlockSpace.smartgrid.rowPadding", GRID_DEFAULTS.rowPadding),
      GRID_DEFAULTS.rowPadding
    ),
    rowTopPadding: asNumber(
      getSettingValue("comfyuiBlockSpace.smartgrid.rowTopPadding", GRID_DEFAULTS.rowTopPadding),
      GRID_DEFAULTS.rowTopPadding
    ),
    rowBottomPadding: asNumber(
      getSettingValue("comfyuiBlockSpace.smartgrid.rowBottomPadding", GRID_DEFAULTS.rowBottomPadding),
      GRID_DEFAULTS.rowBottomPadding
    ),
    nodeVerticalGap: asNumber(
      getSettingValue("comfyuiBlockSpace.smartgrid.nodeVerticalGap", GRID_DEFAULTS.nodeVerticalGap),
      GRID_DEFAULTS.nodeVerticalGap
    ),
    borderJunctionGap: asNumber(
      getSettingValue("comfyuiBlockSpace.smartgrid.borderJunctionGap", GRID_DEFAULTS.borderJunctionGap),
      GRID_DEFAULTS.borderJunctionGap
    ),
    gridLineWidth: asNumber(
      getSettingValue("comfyuiBlockSpace.smartgrid.gridLineWidth", GRID_DEFAULTS.gridLineWidth),
      GRID_DEFAULTS.gridLineWidth
    ),
    gridLineColor: asColor(
      getSettingValue("comfyuiBlockSpace.smartgrid.gridLineColor", GRID_DEFAULTS.gridLineColor),
      GRID_DEFAULTS.gridLineColor
    ),
    gridLineStyle: asDividerStyle(
      getSettingValue("comfyuiBlockSpace.smartgrid.gridLineStyle", GRID_DEFAULTS.gridLineStyle),
      GRID_DEFAULTS.gridLineStyle
    ),
    edgeToEdgeSnapGapPx: asNumber(
      getSettingValue("comfyuiBlockSpace.smartgrid.edgeToEdgeSnapGapPx", GRID_DEFAULTS.edgeToEdgeSnapGapPx),
      GRID_DEFAULTS.edgeToEdgeSnapGapPx
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

function applyGridSettings() {
  if (!window.SmartGrid || typeof window.SmartGrid.setLayoutSettings !== "function") {
    return;
  }
  const settings = getGridSettings();
  window.SmartGrid.setLayoutSettings(settings);
  if (window.BetterNodesSettings) {
    window.BetterNodesSettings.set("comfyuiBlockSpace.smartgrid", settings);
  }
}

function applyNodeSnapSettings() {
  if (window.BetterNodesSettings) {
    window.BetterNodesSettings.set("comfyuiBlockSpace.nodeSnap", {
      hMarginPx: asNumber(
        getSettingValue(
          "comfyuiBlockSpace.nodeSnap.hMarginPx",
          getSettingValue("comfyuiBlockSpace.nodeSnap.marginPx", NODE_SNAP_DEFAULTS.hMarginPx)
        ),
        NODE_SNAP_DEFAULTS.hMarginPx
      ),
      vMarginPx: asNumber(
        getSettingValue(
          "comfyuiBlockSpace.nodeSnap.vMarginPx",
          getSettingValue("comfyuiBlockSpace.nodeSnap.marginPx", NODE_SNAP_DEFAULTS.vMarginPx)
        ),
        NODE_SNAP_DEFAULTS.vMarginPx
      ),
      moveStrength: asNumber(
        getSettingValue("comfyuiBlockSpace.nodeSnap.moveStrength", NODE_SNAP_DEFAULTS.moveStrength),
        NODE_SNAP_DEFAULTS.moveStrength
      ),
      resizeStrength: asNumber(
        getSettingValue("comfyuiBlockSpace.nodeSnap.resizeStrength", NODE_SNAP_DEFAULTS.resizeStrength),
        NODE_SNAP_DEFAULTS.resizeStrength
      ),
      highlightEnabled: asBool(
        getSettingValue("comfyuiBlockSpace.nodeSnap.highlightEnabled", NODE_SNAP_DEFAULTS.highlightEnabled),
        NODE_SNAP_DEFAULTS.highlightEnabled
      ),
      highlightColor: asColor(
        getSettingValue("comfyuiBlockSpace.nodeSnap.highlightColor", NODE_SNAP_DEFAULTS.highlightColor),
        NODE_SNAP_DEFAULTS.highlightColor
      ),
      highlightWidth: asNumber(
        getSettingValue("comfyuiBlockSpace.nodeSnap.highlightWidth", NODE_SNAP_DEFAULTS.highlightWidth),
        NODE_SNAP_DEFAULTS.highlightWidth
      ),
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
  addSetting({
    id: "comfyuiBlockSpace.connector.flowColor",
    name: "Block Space: Flow Color",
    type: "text",
    defaultValue: CONNECTOR_DEFAULTS.flowColor,
    onChange: applyConnectorSettings,
  });
  addSetting({
    id: "comfyuiBlockSpace.connector.preferredStyle",
    name: "Block Space: Preferred Connector Style",
    type: "combo",
    options: ["hybrid", "straight", "angled"],
    defaultValue: CONNECTOR_DEFAULTS.preferredStyle,
    onChange: applyConnectorSettings,
  });
  addSetting({
    id: "comfyuiBlockSpace.connector.enableHybrid",
    name: "Block Space: Enable Connector Hybrid",
    type: "boolean",
    defaultValue: CONNECTOR_DEFAULTS.enableHybrid,
    onChange: applyConnectorSettings,
  });
  addSetting({
    id: "comfyuiBlockSpace.connector.enableStraight",
    name: "Block Space: Enable Connector Straight",
    type: "boolean",
    defaultValue: CONNECTOR_DEFAULTS.enableStraight,
    onChange: applyConnectorSettings,
  });
  addSetting({
    id: "comfyuiBlockSpace.connector.enableAngled",
    name: "Block Space: Enable Connector Angled",
    type: "boolean",
    defaultValue: CONNECTOR_DEFAULTS.enableAngled,
    onChange: applyConnectorSettings,
  });
}

function registerGridSettings() {
  addSetting({
    id: "comfyuiBlockSpace.smartgrid.rowPadding",
    name: "Block Space: Grid Pad",
    type: "number",
    defaultValue: GRID_DEFAULTS.rowPadding,
    onChange: applyGridSettings,
  });
  addSetting({
    id: "comfyuiBlockSpace.smartgrid.rowTopPadding",
    name: "Block Space: Top Pad",
    type: "number",
    defaultValue: GRID_DEFAULTS.rowTopPadding,
    onChange: applyGridSettings,
  });
  addSetting({
    id: "comfyuiBlockSpace.smartgrid.rowBottomPadding",
    name: "Block Space: Bottom Pad",
    type: "number",
    defaultValue: GRID_DEFAULTS.rowBottomPadding,
    onChange: applyGridSettings,
  });
  addSetting({
    id: "comfyuiBlockSpace.smartgrid.nodeVerticalGap",
    name: "Block Space: Node Gap",
    type: "number",
    defaultValue: GRID_DEFAULTS.nodeVerticalGap,
    onChange: applyGridSettings,
  });
  addSetting({
    id: "comfyuiBlockSpace.smartgrid.borderJunctionGap",
    name: "Block Space: Border Gap",
    type: "number",
    defaultValue: GRID_DEFAULTS.borderJunctionGap,
    onChange: applyGridSettings,
  });
  addSetting({
    id: "comfyuiBlockSpace.smartgrid.gridLineWidth",
    name: "Block Space: Divider Width",
    type: "number",
    defaultValue: GRID_DEFAULTS.gridLineWidth,
    onChange: applyGridSettings,
  });
  addSetting({
    id: "comfyuiBlockSpace.smartgrid.gridLineColor",
    name: "Block Space: Divider Color",
    type: "text",
    defaultValue: GRID_DEFAULTS.gridLineColor,
    onChange: applyGridSettings,
  });
  addSetting({
    id: "comfyuiBlockSpace.smartgrid.gridLineStyle",
    name: "Block Space: Divider Style",
    type: "combo",
    options: ["solid", "dashed", "dotted", "double"],
    defaultValue: GRID_DEFAULTS.gridLineStyle,
    onChange: applyGridSettings,
  });
  addSetting({
    id: "comfyuiBlockSpace.smartgrid.edgeToEdgeSnapGapPx",
    name: "Block Space: Edge Snap Gap",
    type: "number",
    defaultValue: GRID_DEFAULTS.edgeToEdgeSnapGapPx,
    onChange: applyGridSettings,
  });
}

function registerNodeSnapSettings() {
  addSetting({
    id: "comfyuiBlockSpace.nodeSnap.hMarginPx",
    name: "Block Space: H Snap Margin",
    type: "number",
    defaultValue: NODE_SNAP_DEFAULTS.hMarginPx,
    onChange: applyNodeSnapSettings,
  });
  addSetting({
    id: "comfyuiBlockSpace.nodeSnap.vMarginPx",
    name: "Block Space: V Snap Margin",
    type: "number",
    defaultValue: NODE_SNAP_DEFAULTS.vMarginPx,
    onChange: applyNodeSnapSettings,
  });
  addSetting({
    id: "comfyuiBlockSpace.nodeSnap.moveStrength",
    name: "Block Space: Move Snap Strength",
    type: "number",
    defaultValue: NODE_SNAP_DEFAULTS.moveStrength,
    onChange: applyNodeSnapSettings,
  });
  addSetting({
    id: "comfyuiBlockSpace.nodeSnap.resizeStrength",
    name: "Block Space: Resize Snap Strength",
    type: "number",
    defaultValue: NODE_SNAP_DEFAULTS.resizeStrength,
    onChange: applyNodeSnapSettings,
  });
  addSetting({
    id: "comfyuiBlockSpace.nodeSnap.highlightEnabled",
    name: "Block Space: Node Snap Highlight Enabled",
    type: "boolean",
    defaultValue: NODE_SNAP_DEFAULTS.highlightEnabled,
    onChange: applyNodeSnapSettings,
  });
  addSetting({
    id: "comfyuiBlockSpace.nodeSnap.highlightColor",
    name: "Block Space: Node Snap Highlight Color",
    type: "text",
    defaultValue: NODE_SNAP_DEFAULTS.highlightColor,
    onChange: applyNodeSnapSettings,
  });
  addSetting({
    id: "comfyuiBlockSpace.nodeSnap.highlightWidth",
    name: "Block Space: Node Snap Highlight Width",
    type: "number",
    defaultValue: NODE_SNAP_DEFAULTS.highlightWidth,
    onChange: applyNodeSnapSettings,
  });
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
    registerGridSettings();
    registerNodeSnapSettings();
    migrateLegacyNodeSnapMargin();
    applyConnectorSettings();
    applyGridSettings();
    applyNodeSnapSettings();
  },
});

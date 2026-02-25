(function () {
  "use strict";

  function reportStatus(message, isError) {
    if (typeof window.__smartDropStatus === "function") {
      window.__smartDropStatus(message, !!isError);
      return;
    }
    if (isError) {
      console.error("[App]", message);
    } else {
      console.log("[App]", message);
    }
  }

  if (typeof window.LiteGraph === "undefined") {
    reportStatus("LiteGraph failed to load in app.js.", true);
    return;
  }
  var WORKSPACE_STORAGE_KEY = "comfy-better-nodes.workspace.v1";

  function SourceMaskNode() {
    this.addOutput("mask", "MASK");
    this.size = [180, 60];
  }
  SourceMaskNode.title = "Source MASK";
  SourceMaskNode.prototype.onExecute = function () {};

  function SourceImageNode() {
    this.addOutput("image", "IMAGE");
    this.size = [180, 60];
  }
  SourceImageNode.title = "Source IMAGE";
  SourceImageNode.prototype.onExecute = function () {};

  function SingleMaskInputNode() {
    this.addInput("mask", "MASK");
    this.size = [200, 70];
  }
  SingleMaskInputNode.title = "Single MASK Input";
  SingleMaskInputNode.prototype.onExecute = function () {};

  function NoImageInputsNode() {
    this.addInput("mask_only", "MASK");
    this.addInput("strength", "NUMBER");
    this.size = [220, 90];
  }
  NoImageInputsNode.title = "No IMAGE Inputs";
  NoImageInputsNode.prototype.onExecute = function () {};

  function MultiMaskInputsNode() {
    this.addInput("head_mask", "MASK");
    this.addInput("torso_mask", "MASK");
    this.addInput("legs_mask", "MASK");
    this.size = [240, 120];
  }
  MultiMaskInputsNode.title = "Multi MASK Inputs";
  MultiMaskInputsNode.prototype.onExecute = function () {};

  window.LiteGraph.registerNodeType("demo/source_mask", SourceMaskNode);
  window.LiteGraph.registerNodeType("demo/source_image", SourceImageNode);
  window.LiteGraph.registerNodeType("demo/single_mask_input", SingleMaskInputNode);
  window.LiteGraph.registerNodeType("demo/no_image_inputs", NoImageInputsNode);
  window.LiteGraph.registerNodeType("demo/multi_mask_inputs", MultiMaskInputsNode);

  var graph = new window.LGraph();
  var canvasElement = document.getElementById("graph-canvas");
  if (!canvasElement) {
    reportStatus("Missing canvas element #graph-canvas.", true);
    return;
  }

  var canvas = new window.LGraphCanvas(canvasElement, graph);
  if (!canvas) {
    reportStatus("Failed to create LGraphCanvas.", true);
    return;
  }
  window.__demoGraph = graph;
  window.__demoCanvas = canvas;

  function createDefaultGraph() {
    var sourceMask = window.LiteGraph.createNode("demo/source_mask");
    var sourceImage = window.LiteGraph.createNode("demo/source_image");
    var singleMaskTarget = window.LiteGraph.createNode("demo/single_mask_input");
    var noImageTarget = window.LiteGraph.createNode("demo/no_image_inputs");
    var multiMaskTarget = window.LiteGraph.createNode("demo/multi_mask_inputs");

    if (!sourceMask || !sourceImage || !singleMaskTarget || !noImageTarget || !multiMaskTarget) {
      reportStatus("One or more demo nodes failed to create.", true);
      return false;
    }

    sourceMask.pos = [60, 120];
    sourceImage.pos = [60, 300];
    singleMaskTarget.pos = [400, 90];
    noImageTarget.pos = [400, 250];
    multiMaskTarget.pos = [400, 430];

    graph.add(sourceMask);
    graph.add(sourceImage);
    graph.add(singleMaskTarget);
    graph.add(noImageTarget);
    graph.add(multiMaskTarget);
    return true;
  }

  function saveWorkspace() {
    try {
      var serialized = graph.serialize();
      window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(serialized));
    } catch (error) {
      reportStatus("Failed to save workspace: " + (error && error.message ? error.message : String(error)), true);
    }
  }

  function loadWorkspace() {
    var raw;
    try {
      raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    } catch (error) {
      reportStatus("localStorage unavailable; using default graph.");
      return false;
    }
    if (!raw) {
      return false;
    }

    try {
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.nodes) || parsed.nodes.length === 0) {
        return false;
      }
      graph.configure(parsed);
      reportStatus("Restored workspace from local storage.");
      return true;
    } catch (error) {
      reportStatus("Failed to restore workspace; using default graph.", true);
      return false;
    }
  }

  if (!loadWorkspace()) {
    if (!createDefaultGraph()) {
      return;
    }
  }

  function resizeCanvasToWindow() {
    canvasElement.width = window.innerWidth;
    canvasElement.height = window.innerHeight;
    if (typeof canvas.resize === "function") {
      canvas.resize();
    }
    if (typeof canvas.setDirty === "function") {
      canvas.setDirty(true, true);
    } else if (typeof canvas.draw === "function") {
      canvas.draw(true, true);
    }
  }

  resizeCanvasToWindow();
  window.addEventListener("resize", resizeCanvasToWindow);

  if (typeof canvas.draw === "function") {
    canvas.draw(true, true);
  }

  var lastSnapshot = "";
  var autosaveErrorShown = false;
  function autosaveWorkspace() {
    var serialized;
    try {
      serialized = JSON.stringify(graph.serialize());
    } catch (error) {
      if (!autosaveErrorShown) {
        autosaveErrorShown = true;
        reportStatus("Autosave serialization failed: " + (error && error.message ? error.message : String(error)), true);
      }
      return;
    }
    if (serialized === lastSnapshot) {
      return;
    }
    lastSnapshot = serialized;
    try {
      window.localStorage.setItem(WORKSPACE_STORAGE_KEY, serialized);
    } catch (error) {
      reportStatus("Autosave failed: " + (error && error.message ? error.message : String(error)), true);
    }
  }

  window.setInterval(autosaveWorkspace, 500);
  window.addEventListener("beforeunload", saveWorkspace);
  saveWorkspace();

  graph.start();
  reportStatus("App graph started. Nodes in graph: " + graph._nodes.length);
})();

(function () {
  "use strict";
  var LOCAL_ASSET_VERSION = "2026-02-25-phase4-grid-border-gap-1";

  var statusLines = [];
  var statusEl = document.getElementById("status-overlay");

  function setStatus(line, isError) {
    var prefix = isError ? "[error] " : "[ok] ";
    statusLines.push(prefix + line);
    if (statusEl) {
      statusEl.textContent = statusLines.join("\n");
      statusEl.style.borderColor = isError ? "#8b3a3a" : "#404040";
    }
    if (isError) {
      console.error("[Bootstrap]", line);
    } else {
      console.log("[Bootstrap]", line);
    }
  }
  window.__smartDropStatus = setStatus;

  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = url;
      script.async = false;
      script.onload = function () {
        resolve(url);
      };
      script.onerror = function () {
        reject(new Error("Failed to load script: " + url));
      };
      document.body.appendChild(script);
    });
  }

  function loadCss(url) {
    return new Promise(function (resolve, reject) {
      var link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = url;
      link.onload = function () {
        resolve(url);
      };
      link.onerror = function () {
        reject(new Error("Failed to load stylesheet: " + url));
      };
      document.head.appendChild(link);
    });
  }

  function tryLoadFirst(urls, loader) {
    var idx = 0;
    return new Promise(function (resolve, reject) {
      function next() {
        if (idx >= urls.length) {
          reject(new Error("All sources failed:\n- " + urls.join("\n- ")));
          return;
        }

        var current = urls[idx];
        idx += 1;

        loader(current)
          .then(function () {
            resolve(current);
          })
          .catch(function () {
            next();
          });
      }
      next();
    });
  }

  window.addEventListener("error", function (event) {
    var message = event && event.message ? event.message : "Unknown startup error";
    setStatus(message, true);
  });

  window.addEventListener("unhandledrejection", function (event) {
    var reason = event && event.reason ? String(event.reason) : "Unknown promise rejection";
    setStatus("Unhandled rejection: " + reason, true);
  });

  (async function bootstrap() {
    try {
      setStatus("Bootstrapping prototype...");

      var cssSource = await tryLoadFirst(
        [
          "https://cdn.jsdelivr.net/npm/litegraph.js@0.7.18/css/litegraph.css",
          "https://unpkg.com/litegraph.js@0.7.18/css/litegraph.css",
        ],
        loadCss
      );
      setStatus("LiteGraph CSS loaded from " + cssSource);

      var jsSource = await tryLoadFirst(
        [
          "https://cdn.jsdelivr.net/npm/litegraph.js@0.7.18/build/litegraph.js",
          "https://unpkg.com/litegraph.js@0.7.18/build/litegraph.js",
        ],
        loadScript
      );
      setStatus("LiteGraph JS loaded from " + jsSource);

      if (typeof window.LiteGraph === "undefined" || typeof window.LGraphCanvas === "undefined") {
        throw new Error("LiteGraph globals are unavailable after script load.");
      }

      await loadScript("./smart-drop.js?v=" + LOCAL_ASSET_VERSION);
      setStatus("Smart Drop patch loaded.");

      await loadScript("./smart-sizing.js?v=" + LOCAL_ASSET_VERSION);
      setStatus("Smart sizing patch loaded.");

      await loadScript("./connection-focus.js?v=" + LOCAL_ASSET_VERSION);
      setStatus("Connection focus patch loaded.");

      await loadScript("./smart-grid-container.js?v=" + LOCAL_ASSET_VERSION);
      setStatus("Smart grid container patch loaded.");

      await loadScript("./app.js?v=" + LOCAL_ASSET_VERSION);
      setStatus("Demo graph initialized.");
    } catch (error) {
      var message = error && error.message ? error.message : String(error);
      setStatus("Bootstrap failed: " + message, true);
    }
  })();
})();

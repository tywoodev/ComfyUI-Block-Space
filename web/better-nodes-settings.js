(function () {
  "use strict";

  if (window.BetterNodesSettings) {
    return;
  }

  var store = {};
  var listeners = {};
  var comfyRuntime = false;

  function get(key, fallback) {
    if (Object.prototype.hasOwnProperty.call(store, key)) {
      return store[key];
    }
    return fallback;
  }

  function emit(key, value) {
    var list = listeners[key];
    if (!Array.isArray(list) || !list.length) {
      return;
    }
    for (var i = 0; i < list.length; i += 1) {
      try {
        list[i](value, key);
      } catch (error) {
        // Keep subscriber errors isolated.
      }
    }
  }

  function set(key, value) {
    store[key] = value;
    emit(key, value);
  }

  function subscribe(key, callback) {
    if (!key || typeof callback !== "function") {
      return function () {};
    }
    if (!Array.isArray(listeners[key])) {
      listeners[key] = [];
    }
    listeners[key].push(callback);
    return function () {
      var list = listeners[key];
      if (!Array.isArray(list)) {
        return;
      }
      var idx = list.indexOf(callback);
      if (idx !== -1) {
        list.splice(idx, 1);
      }
    };
  }

  window.BetterNodesSettings = {
    get: get,
    set: set,
    subscribe: subscribe,
    isComfyUIRuntime: function () {
      return comfyRuntime;
    },
    __setComfyUIRuntime: function (isComfy) {
      comfyRuntime = !!isComfy;
    },
  };
})();

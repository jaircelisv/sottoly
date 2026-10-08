// IPC de Tauri simulado para el panel: se inyecta con page.addInitScript antes de que cargue la App.
// Cada prueba pone sus respuestas en window.__SOTTOLY_IPC__ = { comando: valor | (args) => valor }.
// Lo que no está definido responde null; los eventos (listen) se aceptan y no emiten nada.
(() => {
  let next = 1;
  const callbacks = new Map();
  const calls = [];
  window.__SOTTOLY_CALLS__ = calls;
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } },
    transformCallback(cb) {
      const id = next++;
      callbacks.set(id, cb);
      return id;
    },
    unregisterCallback(id) {
      callbacks.delete(id);
    },
    convertFileSrc(path) {
      return path;
    },
    async invoke(cmd, args) {
      calls.push({ cmd, args });
      if (cmd.startsWith("plugin:event|")) return next++;
      if (cmd === "get_onboarding_status") return { completed: true };
      const table = window.__SOTTOLY_IPC__ || {};
      if (!(cmd in table)) return null;
      const v = table[cmd];
      if (v instanceof Error) throw v.message;
      return typeof v === "function" ? v(args) : v;
    },
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
})();

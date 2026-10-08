// IPC de Tauri simulado para el panel: se inyecta con page.addInitScript antes de que cargue la App.
// Cada prueba pone sus respuestas en window.__SOTTOLY_IPC__ = { comando: valor | (args) => valor }.
// Lo que no está definido responde null; los eventos (listen) se aceptan y no emiten nada.
(() => {
  let next = 1;
  const callbacks = new Map();
  const listeners = new Map(); // evento → ids de callback
  const calls = [];
  // Emite un evento de Tauri como lo haría el puente con el Motor: window.__sottoly_emit(evento, payload).
  // ¿Ya se suscribió la pantalla a este evento? (las pruebas esperan esto antes de emitir)
  window.__sottoly_listening = (event) => (listeners.get(event) || []).length > 0;
  window.__sottoly_emit = (event, payload) => {
    for (const id of listeners.get(event) || []) callbacks.get(id)?.({ event, id: 0, payload });
  };
  window.__SOTTOLY_CALLS__ = calls;
  // Lo que los proveedores de Meetily piden al arrancar, con la App ya configurada y sin grabar.
  const DEFAULTS = {
    get_onboarding_status: { completed: true },
    get_recording_state: { is_recording: false, is_paused: false, is_active: false, recording_duration: null, active_duration: null },
    check_first_launch: false,
    api_get_meetings: [],
  };
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
      if (cmd === "plugin:event|listen") {
        const ids = listeners.get(args.event) || [];
        ids.push(args.handler);
        listeners.set(args.event, ids);
        return args.handler;
      }
      if (cmd.startsWith("plugin:event|")) return null;
      if (cmd in DEFAULTS && !(cmd in (window.__SOTTOLY_IPC__ || {}))) return DEFAULTS[cmd];
      const table = window.__SOTTOLY_IPC__ || {};
      if (!(cmd in table)) return null;
      const v = typeof table[cmd] === "function" ? table[cmd](args) : table[cmd];
      if (v instanceof Error) throw v.message;
      return v;
    },
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
})();

// Arnés de pruebas: simula el IPC de Tauri en el navegador (mockIPC) para que
// el overlay corra como página web. Se empaqueta como IIFE y se inyecta con
// page.addInitScript antes de que cargue el overlay.
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { emit, listen } from "@tauri-apps/api/event";

mockWindows("overlay");
const ipc: { cmd: string; args: unknown }[] = [];
mockIPC(
  (cmd, args) => {
    ipc.push({ cmd, args });
    return null;
  },
  { shouldMockEvents: true },
);

const feedback: unknown[] = [];
void listen("suggestion-feedback", (event) => {
  feedback.push(event.payload);
});

(window as unknown as { __sottoly: unknown }).__sottoly = { emit, feedback, ipc };

import { defineConfig, devices } from "@playwright/test";

// Panel de Sottoly (PLAN.md, tarea 12): la ventana principal en WebKit (el motor de WKWebView),
// contra Next en localhost:3118, con el IPC de Tauri simulado (tests/sottoly/ipc.js).
export default defineConfig({
  testDir: "tests/sottoly",
  timeout: 60_000,
  use: { baseURL: "http://localhost:3118" },
  projects: [{ name: "webkit", use: { ...devices["Desktop Safari"] } }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3118",
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
  },
});

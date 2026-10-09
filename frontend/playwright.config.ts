import { defineConfig, devices } from "@playwright/test";

// Panel de Sottoly (PLAN.md, tarea 12): la ventana principal en WebKit (el motor de WKWebView),
// contra Next en localhost:3118, con el IPC de Tauri simulado (tests/sottoly/ipc.js).
// SOTTOLY_PANEL_PORT: otro puerto para probar desde un worktree mientras la App corre en 3118.
const PORT = Number(process.env.SOTTOLY_PANEL_PORT ?? 3118);

export default defineConfig({
  testDir: "tests/sottoly",
  timeout: 60_000,
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [{ name: "webkit", use: { ...devices["Desktop Safari"] } }],
  webServer: {
    command: PORT === 3118 ? "pnpm dev" : `pnpm exec next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
  },
});

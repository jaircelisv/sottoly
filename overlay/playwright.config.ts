import { defineConfig, devices } from "@playwright/test";

// Tauri usa WKWebView en macOS: probamos en WebKit.
export default defineConfig({
  testDir: "tests",
  globalSetup: "./tests/global-setup.ts",
  use: { baseURL: "http://localhost:3119" },
  projects: [{ name: "webkit", use: { ...devices["Desktop Safari"] } }],
  webServer: {
    command: "bun run scripts/serve.ts",
    url: "http://localhost:3119/healthz",
    reuseExistingServer: !process.env.CI,
  },
});

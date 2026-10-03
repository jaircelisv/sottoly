import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Empaqueta el arnés de mockIPC como IIFE para page.addInitScript.
export default function globalSetup() {
  execSync("bun build tests/harness.ts --format=iife --outfile=.test-dist/harness.js", {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    stdio: "inherit",
  });
}

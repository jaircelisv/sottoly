import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Empaqueta el overlay y el arnés de mockIPC (IIFE para page.addInitScript).
export default function globalSetup() {
  const cwd = fileURLToPath(new URL("..", import.meta.url));
  execSync("bun run build", { cwd, stdio: "inherit" });
  execSync("bun build tests/harness.ts --format=iife --outfile=.test-dist/harness.js", { cwd, stdio: "inherit" });
}

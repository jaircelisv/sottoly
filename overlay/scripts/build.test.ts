// El overlay empaquetado y versionado en frontend/public/overlay/ debe coincidir
// con un build fresco de overlay/. Si falla: `cd overlay && bun run build` y commit.
import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildOverlay } from "./build";

const committed = join(import.meta.dir, "../../frontend/public/overlay");

test("frontend/public/overlay coincide con un build fresco", async () => {
  const outdir = await mkdtemp(join(tmpdir(), "sottoly-overlay-"));
  try {
    await buildOverlay(outdir);
    for (const file of ["overlay.js", "index.html", "overlay.css"]) {
      const fresh = await readFile(join(outdir, file), "utf8");
      const versioned = await readFile(join(committed, file), "utf8");
      expect(versioned, `${file} desactualizado: corre \`bun run build\``).toBe(fresh);
    }
  } finally {
    await rm(outdir, { recursive: true, force: true });
  }
});

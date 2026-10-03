// Empaqueta el overlay en frontend/public/overlay/, donde Tauri lo sirve
// (devUrl en desarrollo, frontendDist en producción).
import { cp, mkdir } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
export const OUTDIR = join(root, "../frontend/public/overlay");

export async function buildOverlay(outdir: string = OUTDIR): Promise<void> {
  await mkdir(outdir, { recursive: true });
  const result = await Bun.build({
    entrypoints: [join(root, "src/main.ts")],
    outdir,
    naming: "overlay.js",
    target: "browser",
    minify: true,
    banner: "// Generado por overlay/scripts/build.ts. No editar a mano.",
  });
  if (!result.success) {
    throw new AggregateError(result.logs, "bun build falló");
  }
  await cp(join(root, "index.html"), join(outdir, "index.html"));
  await cp(join(root, "overlay.css"), join(outdir, "overlay.css"));
}

if (import.meta.main) {
  await buildOverlay();
  console.log(`overlay → ${OUTDIR}`);
}

// Empaqueta el overlay en frontend/public/overlay/, donde Tauri lo sirve
// (devUrl en desarrollo, frontendDist en producción).
import { cp, mkdir } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const outdir = join(root, "../frontend/public/overlay");

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
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
await cp(join(root, "index.html"), join(outdir, "index.html"));
await cp(join(root, "overlay.css"), join(outdir, "overlay.css"));
console.log(`overlay → ${outdir}`);

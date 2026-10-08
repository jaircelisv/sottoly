// Decisiones del cierre para el gate (tarea 17 de PLAN.md): corre frontend/src-tauri/examples/decisions.rs,
// que guarda el summary con la Reunión, lo revisa y escribe la Memoria en carpetas temporales.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const TAURI = join(fileURLToPath(new URL("../../../", import.meta.url)), "frontend", "src-tauri");

export function revisar_decisiones(escenario) {
  const r = spawnSync("cargo", ["run", "-q", "--example", "decisions"], { cwd: TAURI, input: JSON.stringify(escenario), encoding: "utf8" });
  if (r.status !== 0) return { guardadas: 0, por_revisar: false, memoria_lineas: null, error: "no corre" };
  return JSON.parse(r.stdout.trim().split("\n").at(-1));
}

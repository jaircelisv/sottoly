// Calibración de la Compuerta para el gate (tarea 18 de PLAN.md): reproduce las respuestas grabadas de
// Jev sobre los fixtures (evals/runner/run.ts) y mira si los Roles activos dicen con qué se calibraron.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));

export const PRECISION_MINIMA = 0.85;
export const RECALL_MINIMO = 0.75;

export function evals_de_la_compuerta() {
  const r = spawnSync("bun", ["../evals/runner/run.ts", "--json"], { cwd: join(RAIZ, "engine"), encoding: "utf8" });
  if (r.status !== 0) throw new Error(`el runner falló: ${r.stderr.slice(-2000)}`);
  const m = JSON.parse(r.stdout.trim().split("\n").at(-1));
  const activos = readdirSync(join(RAIZ, "roles"))
    .filter((f) => f.endsWith(".md"))
    .map((f) => readFileSync(join(RAIZ, "roles", f), "utf8"))
    .filter((t) => /^status:\s*active\s*$/m.test(t));
  return {
    precision_suficiente: m.precision >= PRECISION_MINIMA,
    recall_suficiente: m.recall >= RECALL_MINIMO,
    sin_grabar: m.sin_grabar,
    roles_activos_calibrados: activos.length > 0 && activos.every((t) => !/^calibrated_with:\s*none\s*$/m.test(t)),
  };
}

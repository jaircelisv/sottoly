// Evals de la Redacción para el gate (PLAN.md, tarea 11): reproduce las Redacciones grabadas del modelo
// real para los fixtures de evals/draft-fixtures/ y aplica los criterios (engine/src/draft-evals.ts).
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ENGINE = fileURLToPath(new URL("../../../engine/", import.meta.url));

export function evals_de_redaccion() {
  const r = spawnSync("bun", ["../evals/runner/draft.ts", "--json"], { cwd: ENGINE, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`el runner falló: ${r.stderr.slice(-2000)}`);
  const { fixtures, cumplen, sin_grabar, fallan } = JSON.parse(r.stdout.trim().split("\n").at(-1));
  return { fixtures, cumplen, sin_grabar, fallan };
}

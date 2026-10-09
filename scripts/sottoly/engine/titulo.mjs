// Título de la Reunión para el gate (PLAN.md, tarea 28). Corre engine/probes/titulo.ts con Bun.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ENGINE = fileURLToPath(new URL("../../../engine/", import.meta.url));

export function titulo_al_cerrar({ modelo }) {
  const r = spawnSync("bun", ["probes/titulo.ts"], { cwd: ENGINE, input: JSON.stringify({ modelo }), encoding: "utf8" });
  if (r.status !== 0) throw new Error(`La sonda del título falló: ${(r.stderr || r.stdout).slice(-2000)}`);
  return JSON.parse(r.stdout.trim().split("\n").at(-1));
}

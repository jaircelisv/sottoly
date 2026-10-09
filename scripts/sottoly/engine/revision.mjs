// Revisión de una Reunión terminada para el gate (PLAN.md, tarea 29). Corre engine/probes/revision.ts con Bun.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ENGINE = fileURLToPath(new URL("../../../engine/", import.meta.url));

export function chat_despues_de_la_reunion({ pregunta, modelo }) {
  const r = spawnSync("bun", ["probes/revision.ts"], { cwd: ENGINE, input: JSON.stringify({ pregunta, modelo }), encoding: "utf8" });
  if (r.status !== 0) throw new Error(`La sonda de la revisión falló: ${(r.stderr || r.stdout).slice(-2000)}`);
  return JSON.parse(r.stdout.trim().split("\n").at(-1));
}

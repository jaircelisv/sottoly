// Eco en el Motor para el gate (PLAN.md, tarea 26). Corre engine/probes/eco.ts con Bun.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ENGINE = fileURLToPath(new URL("../../../engine/", import.meta.url));

export function eco_en_el_motor({ segmentos }) {
  const r = spawnSync("bun", ["probes/eco.ts"], { cwd: ENGINE, input: JSON.stringify({ segmentos }), encoding: "utf8" });
  if (r.status !== 0) throw new Error(`La sonda del eco falló: ${(r.stderr || r.stdout).slice(-2000)}`);
  return JSON.parse(r.stdout.trim().split("\n").at(-1));
}

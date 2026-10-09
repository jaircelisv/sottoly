// Nivel de intervención para el gate (PLAN.md, tarea 30). Corre engine/probes/nivel.ts con Bun.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ENGINE = fileURLToPath(new URL("../../../engine/", import.meta.url));

export function habla_el_rol({ nivel, probabilidad }) {
  const r = spawnSync("bun", ["probes/nivel.ts"], { cwd: ENGINE, input: JSON.stringify({ nivel, probabilidad }), encoding: "utf8" });
  if (r.status !== 0) throw new Error(`La sonda del nivel falló: ${(r.stderr || r.stdout).slice(-2000)}`);
  return JSON.parse(r.stdout.trim().split("\n").at(-1));
}

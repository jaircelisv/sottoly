// El total de tests de `make verify` para el gate (tarea 20 de PLAN.md).
//   contar_total(salida)   → lo que cuenta scripts/sottoly/harness/total-tests.mjs con esa salida
//   make_verify_cierra()   → ¿el último paso de `make verify` imprime el total?
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));
const MODULO = join(RAIZ, "scripts/sottoly/harness/total-tests.mjs");

export async function contar_total(salida) {
  if (!existsSync(MODULO)) return null;
  const { contarTotal } = await import(pathToFileURL(MODULO).href);
  return contarTotal(salida);
}

export function make_verify_cierra() {
  const r = spawnSync("make", ["-n", "verify"], { cwd: RAIZ, encoding: "utf8" });
  const lineas = r.stdout.trim().split("\n").filter(Boolean);
  return { imprime_el_total_al_final: /total-tests\.mjs/.test(lineas.at(-1) ?? "") };
}

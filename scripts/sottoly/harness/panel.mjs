// Panel de Sottoly para el gate (tarea 12 de PLAN.md): corre las specs de Playwright de la ventana
// principal (frontend/tests/sottoly) y devuelve cuántas pasan y cuántas fallan.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const FRONTEND = fileURLToPath(new URL("../../../frontend/", import.meta.url));

export function specs_del_panel() {
  const r = spawnSync("pnpm", ["exec", "playwright", "test", "panel.spec.ts", "--reporter=json"], {
    cwd: FRONTEND,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  let informe;
  try {
    informe = JSON.parse(r.stdout);
  } catch {
    throw new Error(`Playwright no devolvió un informe: ${(r.stderr || r.stdout).slice(-2000)}`);
  }
  const { expected = 0, unexpected = 0, flaky = 0, skipped = 0 } = informe.stats ?? {};
  return { pasan: expected, fallan: unexpected + flaky, saltadas: skipped, al_menos_7: expected + unexpected + flaky >= 7 };
}

/** Las specs de un archivo de frontend/tests/sottoly (tarea 13 en adelante). */
export function specs_de(archivo) {
  const r = spawnSync("pnpm", ["exec", "playwright", "test", archivo, "--reporter=json"], {
    cwd: FRONTEND,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  let informe;
  try {
    informe = JSON.parse(r.stdout);
  } catch {
    throw new Error(`Playwright no devolvió un informe: ${(r.stderr || r.stdout).slice(-2000)}`);
  }
  const { expected = 0, unexpected = 0, flaky = 0, skipped = 0 } = informe.stats ?? {};
  return { pasan: expected, fallan: unexpected + flaky, saltadas: skipped };
}

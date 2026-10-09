// `make demo` y las tarjetas de demostración (tarea 22 de PLAN.md): el gate abre la App con `make demo`; sin
// DEMO=1 no debe mostrar Sugerencias inventadas (SOTTOLY_DEMO_SUGGESTIONS) mientras uno trabaja.
// ⚠ No usar `make -n demo`: make ejecuta igual las líneas con $(MAKE) y la receta de demo es una sola línea
// (abre la App y su `trap 'kill 0'` corta la terminal). `make demo-env` solo imprime cómo arrancaría.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));
const enDemo = (args) => {
  const r = spawnSync("make", ["-s", "demo-env", ...args], { cwd: RAIZ, encoding: "utf8", timeout: 20_000 });
  return r.status === 0 && /^SOTTOLY_DEMO_SUGGESTIONS=1$/m.test(r.stdout);
};

export function tarjetas_de_demostracion() {
  return { por_defecto: enDemo([]), con_DEMO_1: enDemo(["DEMO=1"]) };
}

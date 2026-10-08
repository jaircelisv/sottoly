// Total de tests de `make verify` (PLAN.md, tarea 20). El gate se queda con el número más grande que ve en
// la salida («N passed»); sin este total, solo contaba cargo test. Suma lo que pasó en cada suite:
//   bun test     « 92 pass»
//   Playwright   «  23 passed (39.2s)»
//   cargo test   «test result: ok. 313 passed; …» (una línea por binario de pruebas)
// Lo que falló no se cuenta como pasado. Uso: node total-tests.mjs <carpeta con las salidas .txt>
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const sum = (texto, re) => [...texto.matchAll(re)].reduce((n, m) => n + Number(m[1]), 0);

/** @returns {{ bun: number, playwright: number, cargo: number, total: number }} */
export function contarTotal(salida) {
  const texto = salida.replace(/\x1b\[[0-9;]*m/g, "");
  const bun = sum(texto, /^\s*(\d+) pass\s*$/gm);
  const playwright = sum(texto, /^\s*(\d+) passed \(/gm);
  const cargo = sum(texto, /^test result: (?:ok|FAILED)\. (\d+) passed;/gm);
  return { bun, playwright, cargo, total: bun + playwright + cargo };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2];
  const salida = readdirSync(dir)
    .filter((f) => f.endsWith(".txt"))
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .join("\n");
  const t = contarTotal(salida);
  console.log(`Sottoly: ${t.total} passed en total (bun ${t.bun} · Playwright ${t.playwright} · cargo ${t.cargo})`);
}

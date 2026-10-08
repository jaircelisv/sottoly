// Calibración de la Compuerta (PLAN.md, tarea 18; SPEC §5 y §8). Con las respuestas grabadas de Jev sobre
// los fixtures (evals/fixtures y los ejemplos del creador de Roles), prueba juegos de umbrales de los Roles
// activos y elige el de mejor F1 con precisión ≥ 0,85. No llama a Jev: el umbral no entra a la pregunta, solo filtra la respuesta.
//   bun evals/runner/calibrate.ts           muestra lo que elegiría
//   bun evals/runner/calibrate.ts --write   escribe threshold y calibrated_with en roles/*.md
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import config from "../../engine/config.json";
import { computeMetrics, loadCreatorExampleFixtures, loadFixtures, Recordings, replayEvaluator, runFixture } from "../../engine/src/evals";
import { loadRoles, type Role } from "../../engine/src/roles";

const ROOT = join(import.meta.dir, "../..");
const PRECISION_MINIMA = 0.85;
const model = config.gate.model;
const fixtures = [...loadFixtures(join(ROOT, "evals/fixtures")), ...loadCreatorExampleFixtures(join(ROOT, "roles"))];
const evaluate = replayEvaluator(model, new Recordings(join(ROOT, `evals/recordings/${model}.json`)));
const base = loadRoles(join(ROOT, "roles"));

async function measure(roles: Role[]) {
  const runs = [];
  for (const f of fixtures) runs.push(await runFixture(f, { roles, evaluate, config, now: () => 0 }));
  return computeMetrics(runs);
}

const f1 = (m: { precision: number; recall: number }) => (m.precision + m.recall ? (2 * m.precision * m.recall) / (m.precision + m.recall) : 0);
const GRID = Array.from({ length: 10 }, (_, i) => Math.round((0.5 + i * 0.05) * 100) / 100); // 0.50 … 0.95

// Búsqueda conjunta sobre los Roles activos. Se respeta el orden de exigencia que ya tenían (el que era más
// estricto sigue siéndolo: el CEO adversarial habla con más evidencia que el CFO, roles.test.ts).
const active = base.filter((r) => r.status === "active");
const keepsOrder = (ts: number[]) =>
  active.every((a, i) => active.every((b, j) => !(a.threshold > b.threshold) || ts[i]! > ts[j]!));
const combos = (n: number): number[][] => (n === 0 ? [[]] : combos(n - 1).flatMap((c) => GRID.map((t) => [...c, t])));

let best: { ts: number[]; m: Awaited<ReturnType<typeof measure>> } | null = null;
for (const ts of combos(active.length)) {
  if (!keepsOrder(ts)) continue;
  const m = await measure(base.map((r) => (active.includes(r) ? { ...r, threshold: ts[active.indexOf(r)]! } : r)));
  if (m.precision < PRECISION_MINIMA) continue;
  const sum = (x: number[]) => x.reduce((a, b) => a + b, 0);
  // Empate: los umbrales más altos (se habla menos).
  if (!best || f1(m) > f1(best.m) || (f1(m) === f1(best.m) && sum(ts) > sum(best.ts))) best = { ts, m };
}
if (!best) {
  console.log(`ningún juego de umbrales llega a precisión ${PRECISION_MINIMA}; no se cambia nada`);
  process.exit(1);
}
const roles = base.map((r) => (active.includes(r) ? { ...r, threshold: best!.ts[active.indexOf(r)]! } : r));
for (const r of active) console.log(`${r.id}: ${r.threshold} → ${roles.find((x) => x.id === r.id)!.threshold}`);

const final = await measure(roles);
const today = new Date().toISOString().slice(0, 10);
const stamp = `evals-${today} ${model} ${fixtures.length} fixtures precisión ${final.precision} recall ${final.recall}`;
console.log(`\nfinal: precisión ${final.precision}, recall ${final.recall}`);

if (process.argv.includes("--write")) {
  for (const r of roles.filter((r) => r.status === "active")) {
    const path = join(ROOT, "roles", `${r.id}.md`);
    const text = readFileSync(path, "utf8")
      .replace(/^threshold: .*$/m, `threshold: ${r.threshold}`)
      .replace(/^calibrated_with: .*$/m, `calibrated_with: "${stamp}"`);
    writeFileSync(path, text);
  }
  console.log(`escrito en roles/: calibrated_with: "${stamp}"`);
}

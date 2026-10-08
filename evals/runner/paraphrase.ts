// Evals del antiruido para la misma idea con otras palabras (PLAN.md, tarea 19). Pares sintéticos
// (evals/paraphrase-pairs.json): una Sugerencia nueva frente a las ya mostradas, y si es la misma idea.
// La decisión es la del Motor: la comparación de palabras (sameIdea) y, si existe, el juez (dedupe.ts),
// con sus respuestas grabadas. --record llama al modelo real (ANTHROPIC_API_KEY). --json: una línea.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import config from "../../engine/config.json";
import { sameIdea } from "../../engine/src/draft";
import { Recordings } from "../../engine/src/evals";

const ROOT = join(import.meta.dir, "../..");
const record = process.argv.includes("--record");
const pairs = JSON.parse(readFileSync(join(ROOT, "evals/paraphrase-pairs.json"), "utf8")) as { id: string; previous: string[]; candidate: string; same: boolean }[];

const dedupePath = join(ROOT, "engine/src/dedupe.ts");
const dedupe = existsSync(dedupePath) ? await import(dedupePath) : null;
const model = config.draft.model;
const recordings = new Recordings<boolean>(join(ROOT, `evals/recordings/${model}-dedupe.json`));
const judge = dedupe
  ? record
    ? dedupe.recordingDeduper(model, (await import("../../engine/src/providers")).anthropicDeduper(model), recordings)
    : dedupe.replayDeduper(model, recordings)
  : null;

const results: { id: string; ok: boolean; recorded: boolean; got?: boolean; want: boolean }[] = [];
for (const p of pairs) {
  const lexical = p.previous.some((prev) => sameIdea(prev, p.candidate));
  let got = lexical;
  let recorded = true;
  if (!lexical && judge) {
    try {
      got = await judge(p.candidate, p.previous);
    } catch {
      recorded = false;
    }
  }
  results.push({ id: p.id, ok: recorded && got === p.same, recorded, got, want: p.same });
}
if (record) recordings.save();

const summary = {
  pares: results.length,
  aciertan: results.filter((r) => r.ok).length,
  sin_grabar: results.filter((r) => !r.recorded).length,
  fallan: results.filter((r) => r.recorded && !r.ok).map((r) => `${r.id}: esperaba ${r.want ? "misma idea" : "distinta"}`),
};
if (process.argv.includes("--json")) console.log(JSON.stringify(summary));
else {
  for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.id}: ${r.recorded ? (r.got ? "misma idea" : "distinta") : "sin grabar"} (esperaba ${r.want ? "misma" : "distinta"})`);
  console.log(`\n${summary.aciertan} de ${summary.pares} · ${summary.sin_grabar} sin grabar`);
}

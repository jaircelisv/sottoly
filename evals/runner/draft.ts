// Runner de evals de la Redacción (PLAN.md, tarea 11).
//   bun evals/runner/draft.ts            reproduce las Redacciones grabadas y aplica los criterios
//   bun evals/runner/draft.ts --record   llama al modelo real (ANTHROPIC_API_KEY) y graba
//   bun evals/runner/draft.ts --json     una línea JSON con el resumen (la usa el gate)
import { join } from "node:path";
import config from "../../engine/config.json";
import { loadDraftFixtures, runDraftEvals } from "../../engine/src/draft-evals";
import { Recordings } from "../../engine/src/evals";
import type { Draft } from "../../engine/src/draft";
import { anthropicDrafter } from "../../engine/src/providers";
import { loadRoles } from "../../engine/src/roles";

const ROOT = join(import.meta.dir, "../..");
const record = process.argv.includes("--record");
const json = process.argv.includes("--json");
const model = config.draft.model;

const recordings = new Recordings<Draft>(join(ROOT, `evals/recordings/${model}-draft-evals.json`));
const results = await runDraftEvals(
  loadDraftFixtures(join(ROOT, "evals/draft-fixtures")),
  loadRoles(join(ROOT, "roles")),
  model,
  recordings,
  record ? anthropicDrafter(model, config.draft.max_tokens) : undefined,
);
if (record) recordings.save();

const summary = {
  fixtures: results.length,
  cumplen: results.filter((r) => r.recorded && r.fails.length === 0).length,
  sin_grabar: results.filter((r) => !r.recorded).length,
  fallan: results.filter((r) => r.recorded && r.fails.length > 0).map((r) => `${r.id}: ${r.fails.join("; ")}`),
};

if (json) {
  console.log(JSON.stringify(summary));
} else {
  for (const r of results) {
    const what = r.draft?.skip ? "(declina)" : r.draft?.text ?? "—";
    console.log(`${r.fails.length ? "✗" : "✓"} ${r.id}: ${what}${r.fails.length ? `\n    ${r.fails.join("\n    ")}` : ""}`);
  }
  console.log(`\n${summary.cumplen} de ${summary.fixtures} cumplen · ${summary.sin_grabar} sin grabar`);
}

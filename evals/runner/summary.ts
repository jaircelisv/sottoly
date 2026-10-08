// Runner de evals de las Decisiones (PLAN.md, tarea 16).
//   bun evals/runner/summary.ts            reproduce las Redacciones grabadas y aplica los criterios
//   bun evals/runner/summary.ts --record   llama al modelo real (ANTHROPIC_API_KEY) y graba
//   bun evals/runner/summary.ts --json     una línea JSON con el resumen (la usa el gate)
import { join } from "node:path";
import config from "../../engine/config.json";
import { loadSummaryFixtures, runSummaryEvals } from "../../engine/src/summary-evals";
import { Recordings } from "../../engine/src/evals";
import type { CandidateDecision } from "../../engine/src/summary";
import { anthropicSummarizer } from "../../engine/src/providers";

const ROOT = join(import.meta.dir, "../..");
const record = process.argv.includes("--record");
const json = process.argv.includes("--json");
const model = config.summary.model;

const recordings = new Recordings<CandidateDecision[]>(join(ROOT, `evals/recordings/${model}-summary-evals.json`));
const results = await runSummaryEvals(
  loadSummaryFixtures(join(ROOT, "evals/summary-fixtures")),
  model,
  recordings,
  record ? anthropicSummarizer(model, config.summary.max_tokens) : undefined,
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
    const what = r.decisions ? (r.decisions.length ? r.decisions.map((d) => `[${d.kind}·${d.owner}${d.due ? `·${d.due}` : ""}] ${d.text}`).join(" | ") : "(ninguna)") : "—";
    console.log(`${r.fails.length ? "✗" : "✓"} ${r.id}: ${what}${r.fails.length ? `\n    ${r.fails.join("\n    ")}` : ""}`);
  }
  console.log(`\n${summary.cumplen} de ${summary.fixtures} cumplen · ${summary.sin_grabar} sin grabar`);
}

// Evals de las Decisiones candidatas (PLAN.md, tarea 16): fixtures sintéticos de evals/summary-fixtures/
// con la respuesta correcta y criterios deterministas sobre lo que propone el modelo. Lo real se graba
// fuera de CI; aquí se reproduce. Un prompt nuevo sin grabar cuenta como «sin grabar», nunca como aprobado.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { draftRecordingKey, type Recordings } from "./evals";
import { buildSummaryPrompt, type CandidateDecision, type Summarizer } from "./summary";

/** Fecha fija para los evals: va en el prompt y en la clave de la grabación. */
export const EVALS_TODAY = "2026-10-07";

const Match = z.object({
  kind: z.enum(["decision", "commitment"]).optional(),
  owner: z.enum(["user", "counterpart"]).optional(),
  /** Todas estas palabras en el texto (sin tildes ni mayúsculas). */
  all: z.array(z.string()).default([]),
  /** Alguna de estas palabras en el texto. */
  any: z.array(z.string()).default([]),
  /** true: con fecha (due). */
  due: z.boolean().optional(),
});
type Match = z.infer<typeof Match>;

export const SummaryFixture = z.object({
  id: z.string().min(1),
  description: z.string(),
  segments: z.array(z.object({ speaker: z.enum(["user", "counterpart"]), text: z.string(), t0: z.number(), t1: z.number() })),
  expect: z.object({
    /** No se decidió nada: la lista tiene que venir vacía. */
    none: z.boolean().optional(),
    /** Cada una tiene que aparecer. */
    include: z.array(Match).default([]),
    /** Ninguna puede aparecer (lo que no se aceptó). */
    forbid: z.array(Match).default([]),
    /** Como mucho estas Decisiones (no rellenar). */
    max: z.number().int().positive().optional(),
  }),
});
export type SummaryFixture = z.infer<typeof SummaryFixture>;

export function loadSummaryFixtures(dir: string): SummaryFixture[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => SummaryFixture.parse(JSON.parse(readFileSync(join(dir, f), "utf8"))));
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function matches(m: Match, d: CandidateDecision): boolean {
  const text = norm(d.text);
  if (m.kind && d.kind !== m.kind) return false;
  if (m.owner && d.owner !== m.owner) return false;
  if (m.due !== undefined && Boolean(d.due) !== m.due) return false;
  if (!m.all.every((w) => text.includes(norm(w)))) return false;
  if (m.any.length && !m.any.some((w) => text.includes(norm(w)))) return false;
  return true;
}

function describe(m: Match): string {
  return [m.kind, m.owner, ...m.all, ...m.any].filter(Boolean).join(" / ");
}

/** Lo que falla de las Decisiones propuestas frente a su fixture; vacío = cumple. */
export function judgeSummary(fixture: SummaryFixture, decisions: CandidateDecision[]): string[] {
  const fails: string[] = [];
  const { expect } = fixture;
  if (expect.none && decisions.length > 0) fails.push(`no se decidió nada y propuso ${decisions.length}: ${decisions.map((d) => `«${d.text}»`).join(", ")}`);
  for (const m of expect.include) if (!decisions.some((d) => matches(m, d))) fails.push(`falta: ${describe(m)}`);
  for (const m of expect.forbid) {
    const bad = decisions.find((d) => matches(m, d));
    if (bad) fails.push(`inventó: «${bad.text}» (${bad.kind}, ${bad.owner})`);
  }
  if (expect.max !== undefined && decisions.length > expect.max) fails.push(`propuso ${decisions.length}, más de ${expect.max}`);
  return fails;
}

export interface SummaryEvalResult {
  id: string;
  recorded: boolean;
  decisions?: CandidateDecision[];
  fails: string[];
}

export async function runSummaryEvals(
  fixtures: SummaryFixture[],
  model: string,
  recordings: Recordings<CandidateDecision[]>,
  live?: Summarizer,
): Promise<SummaryEvalResult[]> {
  const out: SummaryEvalResult[] = [];
  for (const fixture of fixtures) {
    const prompt = buildSummaryPrompt(fixture.segments, EVALS_TODAY);
    const key = draftRecordingKey(model, prompt);
    let decisions = recordings.get(key);
    if (live) {
      decisions = await live(prompt);
      recordings.set(key, decisions);
    }
    if (!decisions) {
      out.push({ id: fixture.id, recorded: false, fails: ["sin grabar: corre evals/runner/summary.ts --record"] });
      continue;
    }
    out.push({ id: fixture.id, recorded: true, decisions, fails: judgeSummary(fixture, decisions) });
  }
  return out;
}

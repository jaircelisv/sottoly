// Evals de la Redacción (PLAN.md, tarea 11): fixtures sintéticos de evals/draft-fixtures/ y criterios
// deterministas sobre lo que escribe el modelo. Las respuestas reales se graban fuera de CI y aquí se
// reproducen: un prompt nuevo sin grabar cuenta como «sin grabar», nunca como aprobado.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { buildDraftPrompt, finalizeDraft, sameIdea, type Draft, type Drafter } from "./draft";
import { draftRecordingKey, type Recordings } from "./evals";
import type { Role } from "./roles";

export const DraftFixture = z.object({
  id: z.string().min(1),
  role: z.string().min(1),
  description: z.string(),
  segments: z.array(z.object({ speaker: z.enum(["user", "counterpart"]), text: z.string(), t0: z.number(), t1: z.number() })),
  previous: z.array(z.string()).default([]),
  expect: z.object({
    /** true: el Rol no tiene nada que decir; false: tiene que sugerir algo. Sin valor: cualquiera. */
    skip: z.boolean().optional(),
    /** Palabras que la Sugerencia no puede usar (temas fuera del Rol). */
    not_mention: z.array(z.string()).default([]),
  }),
});
export type DraftFixture = z.infer<typeof DraftFixture>;

export function loadDraftFixtures(dir: string): DraftFixture[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => DraftFixture.parse(JSON.parse(readFileSync(join(dir, f), "utf8"))));
}

const NEGATIVA = /\b(no (opino|opina|puedo opinar|me corresponde|es mi (rol|tema))|fuera de mi (rol|alcance))\b/i;

/** Lo que falla de una Redacción frente a su fixture; vacío = cumple. */
export function judgeDraft(fixture: DraftFixture, role: Pick<Role, "persona">, draft: Draft): string[] {
  const fails: string[] = [];
  const { expect } = fixture;
  if (draft.skip) {
    if (expect.skip === false) fails.push("declinó, y tenía algo que sugerir");
    return fails;
  }
  if (expect.skip === true) fails.push("sugirió algo, y no tenía nada que decir dentro de su Rol");
  const final = finalizeDraft(draft);
  if (!final) return [...fails, "Redacción vacía"];
  const text = final.text;
  if (/^[¿¡]/.test(text)) fails.push("es la pregunta textual para la Contraparte, no una indicación para el Usuario");
  if (new RegExp(`\\b${role.persona}\\b`, "i").test(text)) fails.push(`habla de ${role.persona} en tercera persona`);
  if (NEGATIVA.test(text)) fails.push("es una negativa escrita como Sugerencia");
  if (!/[.?!]$/.test(text)) fails.push("la frase queda sin cerrar");
  const lower = text.toLowerCase();
  for (const w of expect.not_mention) if (lower.includes(w.toLowerCase())) fails.push(`menciona «${w}», fuera del Rol`);
  for (const p of fixture.previous) if (sameIdea(p, text)) fails.push("repite una Sugerencia ya mostrada");
  return fails;
}

export interface DraftEvalResult {
  id: string;
  recorded: boolean;
  draft?: Draft;
  fails: string[];
}

/** Corre cada fixture con el Drafter dado (real que graba, o el que reproduce). */
export async function runDraftEvals(
  fixtures: DraftFixture[],
  roles: Role[],
  model: string,
  recordings: Recordings<Draft>,
  live?: Drafter,
): Promise<DraftEvalResult[]> {
  const out: DraftEvalResult[] = [];
  for (const fixture of fixtures) {
    const role = roles.find((r) => r.id === fixture.role);
    if (!role) throw new Error(`fixture ${fixture.id}: Rol desconocido ${fixture.role}`);
    const prompt = buildDraftPrompt(role, fixture.segments, fixture.previous);
    const key = draftRecordingKey(model, prompt);
    let draft = recordings.get(key);
    if (live) {
      draft = await live(prompt);
      recordings.set(key, draft);
    }
    if (!draft) {
      out.push({ id: fixture.id, recorded: false, fails: ["sin grabar: corre evals/runner/draft.ts --record"] });
      continue;
    }
    out.push({ id: fixture.id, recorded: true, draft, fails: judgeDraft(fixture, role, draft) });
  }
  return out;
}

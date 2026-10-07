// Decisiones candidatas al cerrar la Reunión (SPEC §6). El Motor las propone; el Usuario aprueba,
// edita o descarta cada una. Aquí solo se piden al modelo: id, fuente, Reunión y fecha los pone el Motor.
import { z } from "zod";
import { renderWindow, type WindowSegment } from "./gate";
import type { Decision } from "./protocol";

/** Lo que se le pide al modelo por cada Decisión o compromiso. */
export const CandidateDecision = z.object({
  kind: z.enum(["decision", "commitment"]).describe("decision: algo que se resolvió; commitment: algo que alguien se comprometió a hacer"),
  text: z.string().describe("Una frase, en el idioma de la reunión, que se entienda sin la transcripción"),
  owner: z.enum(["user", "counterpart"]).describe("Quién lo decidió o se comprometió: el Usuario o la Contraparte"),
  due: z.string().nullable().describe("Fecha AAAA-MM-DD si es un compromiso con fecha; si no, null"),
});
export type CandidateDecision = z.infer<typeof CandidateDecision>;

export const SummaryOutput = z.object({ decisions: z.array(CandidateDecision) });

export interface SummaryPrompt {
  system: string;
  prompt: string;
}

/** Proveedor intercambiable: devuelve las Decisiones candidatas de la Reunión. */
export type Summarizer = (prompt: SummaryPrompt) => Promise<CandidateDecision[]>;

export function buildSummaryPrompt(segments: WindowSegment[], today: string): SummaryPrompt {
  const system = [
    "Lees la transcripción completa de una reunión y propones las Decisiones que el Usuario podría querer guardar.",
    "Una Decisión es algo que quedó resuelto o un compromiso concreto de alguien. No incluyas opiniones, temas abiertos ni preguntas sin respuesta.",
    "Si no se resolvió nada, devuelve una lista vacía. No inventes: cada Decisión tiene que estar dicha en la transcripción.",
    `Hoy es ${today}. Si un compromiso tiene fecha relativa («el viernes»), conviértela a AAAA-MM-DD.`,
  ].join("\n\n");
  return { system, prompt: `Transcripción de la reunión:\n${renderWindow(segments)}` };
}

/** Completa las candidatas con lo que pone el Motor. Ninguna sale aprobada: eso lo decide el Usuario. */
export function toDecisions(candidates: CandidateDecision[], meetingId: string, createdAt: string): Decision[] {
  return candidates
    .filter((c) => c.text.trim())
    .map((c, i) => ({
      id: `${meetingId}-d${i + 1}`,
      kind: c.kind,
      text: c.text.trim(),
      owner: c.owner,
      due: c.due,
      source: "engine",
      meeting_id: meetingId,
      created_at: createdAt,
      approved: false,
    }));
}

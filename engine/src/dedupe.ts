// Antiruido para la misma idea con otras palabras (PLAN.md, tarea 19). sameIdea (draft.ts) compara
// palabras; las paráfrasis se le escapan. Cuando ya hay Sugerencias mostradas y la nueva no coincide en
// palabras, un juez decide si dice lo mismo que alguna. Si el juez falla, la Sugerencia sale.
import { draftRecordingKey, type Recordings } from "./evals";

export interface DedupePrompt {
  system: string;
  prompt: string;
}

/** true si `candidate` dice lo mismo que alguna de `previous`. */
export type Deduper = (candidate: string, previous: string[]) => Promise<boolean>;

export function buildDedupePrompt(candidate: string, previous: string[]): DedupePrompt {
  return {
    system: [
      "Comparas sugerencias que un asesor le muestra a alguien durante una reunión.",
      "Responde same en true si la nueva pide o aconseja en el fondo lo mismo que alguna de las ya mostradas, aunque use otras palabras o cambie un detalle menor: si las dos le piden a la misma persona que aclare o entregue lo mismo, es la misma idea.",
      "Responde same en false si trae un punto distinto, aunque hable del mismo tema o comparta palabras (por ejemplo, IVA y retenciones son puntos distintos).",
    ].join("\n"),
    prompt: `Ya mostradas:\n${previous.map((p) => `- ${p}`).join("\n")}\n\nNueva: ${candidate}`,
  };
}

/** Reproduce respuestas grabadas del juez. Un prompt sin grabar falla: hay que grabar. */
export function replayDeduper(model: string, recordings: Recordings<boolean>): Deduper {
  return async (candidate, previous) => {
    const v = recordings.get(draftRecordingKey(model, buildDedupePrompt(candidate, previous)));
    if (v === undefined) throw new Error("missing dedupe recording");
    return v;
  };
}

/** Llama al juez real y guarda cada respuesta. */
export function recordingDeduper(model: string, live: (p: DedupePrompt) => Promise<boolean>, recordings: Recordings<boolean>): Deduper {
  return async (candidate, previous) => {
    const prompt = buildDedupePrompt(candidate, previous);
    const v = await live(prompt);
    recordings.set(draftRecordingKey(model, prompt), v);
    return v;
  };
}

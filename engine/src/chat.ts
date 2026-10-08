// Chat con el Rol durante la Reunión (PLAN.md, tarea 13): el Usuario le responde a una Sugerencia o le
// pregunta al Rol por lo que se está diciendo. El Rol responde con lo que oyó, en su tono (la Persona).
import { renderWindow, type WindowSegment } from "./gate";
import { describeLimits } from "./draft";
import type { Role } from "./roles";

export interface ChatPrompt {
  system: string;
  prompt: string;
}

/** Proveedor intercambiable. `onText` recibe el texto acumulado mientras llega (streaming). */
export type Chatter = (prompt: ChatPrompt, onText?: (text: string) => void) => Promise<string>;

export interface ChatTurn {
  question: string;
  answer: string;
}

/** Cuántos intercambios previos con el mismo Rol entran al prompt. */
export const CHAT_HISTORY = 6;

export function buildChatPrompt(
  role: Pick<Role, "role" | "persona" | "objective" | "limits" | "instructions">,
  transcript: WindowSegment[],
  question: string,
  options: { replyTo?: string; history?: ChatTurn[] } = {},
): ChatPrompt {
  const system = [
    `Eres ${role.persona}, ${role.role} de la junta asesora del Usuario. Estás escuchando su reunión en vivo y él te escribe en un chat.`,
    `Objetivo: ${role.objective}`,
    role.instructions,
    `No opines sobre: ${describeLimits(role.limits)}.`,
    "Responde en una a tres frases, en el idioma de la reunión, directo y sin jerga. Básate en lo que se dijo en la transcripción; si algo no se dijo, dilo en vez de inventarlo.",
  ].join("\n\n");
  const parts = [`Transcripción de la reunión hasta ahora:\n${renderWindow(transcript) || "(todavía no se ha dicho nada)"}`];
  const history = (options.history ?? []).slice(-CHAT_HISTORY);
  if (history.length) parts.push(`Lo que ya hablaron en el chat:\n${history.map((t) => `Usuario: ${t.question}\nTú: ${t.answer}`).join("\n")}`);
  if (options.replyTo) parts.push(`El Usuario responde a tu sugerencia: «${options.replyTo}»`);
  parts.push(`Usuario: ${question}`);
  return { system, prompt: parts.join("\n\n") };
}

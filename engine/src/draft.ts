// Redacción: escribe la Sugerencia del Rol elegido por la Compuerta (SPEC §4).
// La Persona solo entra aquí (tono) y en la UI; nunca en la Compuerta.
import { z } from "zod";
import type { WindowSegment } from "./gate";
import { renderWindow } from "./gate";
import type { Role } from "./roles";

/** Lo que se le pide al modelo. */
export const TARGET_WORDS = { min: 10, max: 14 };
/** Tope duro: lo que pase se recorta al último signo de puntuación (sin reintentos). */
export const HARD_MAX_WORDS = 20;

/** Ejemplos de forma (no de contenido) para que la Redacción salga corta. */
const EXAMPLES = [
  "Pregunta si los dos millones incluyen IVA y en qué moneda se facturan.",
  "Antes de aceptar el anticipo, pide el calendario de pagos por escrito.",
  "Pide que la renovación automática tenga un aviso previo de sesenta días.",
];

/** Lo que se le pide al modelo. `skip` va primero: si declina, se sabe antes de que llegue texto. */
export const DraftOutput = z.object({
  skip: z.boolean().describe("true si no hay nada útil que sugerir dentro de tu Rol; entonces text y reason van vacíos"),
  text: z.string(),
  reason: z.string(),
});

/** Una Redacción. `skip: true` = el Rol declina: no hay Sugerencia y no es un fallo. */
export const Draft = z.object({
  skip: z.boolean().optional(),
  text: z.string(),
  reason: z.string(),
});
export type Draft = z.infer<typeof Draft>;

export interface DraftPrompt {
  system: string;
  prompt: string;
}

/** Proveedor intercambiable. `onText` recibe el texto acumulado mientras llega (streaming). */
export type Drafter = (prompt: DraftPrompt, onText?: (text: string) => void) => Promise<Draft>;

/** Cuántas Sugerencias ya mostradas recibe la Redacción para no repetirlas. */
export const PREVIOUS_IN_PROMPT = 8;

export function buildDraftPrompt(
  role: Pick<Role, "role" | "persona" | "objective" | "limits" | "instructions">,
  window: WindowSegment[],
  previous: string[] = [],
): DraftPrompt {
  const system = [
    `Eres ${role.persona}, ${role.role} de la junta asesora del Usuario.`,
    `Objetivo: ${role.objective}`,
    role.instructions,
    `No opines sobre: ${role.limits.join(", ")}.`,
    `Responde con una sugerencia para el Usuario de entre ${TARGET_WORDS.min} y ${TARGET_WORDS.max} palabras, en el idioma de la reunión, y el motivo en una línea. Una sola idea: lo más urgente.`,
    `Si lo que se está diciendo no te da nada útil que sugerir dentro de tu Rol, o cae en lo que no opinas, responde con skip en true y text y reason vacíos. Nunca escribas como sugerencia que no vas a opinar.`,
    `Ejemplos de sugerencia (la forma, no el contenido):\n${EXAMPLES.map((e) => `- ${e}`).join("\n")}`,
  ].join("\n\n");
  // Lo ya sugerido va en el mensaje, no en el system: así el system de cada Rol sigue en caché.
  const said = previous.slice(-PREVIOUS_IN_PROMPT);
  const already = said.length
    ? `Ya sugeriste en esta reunión:\n${said.map((s) => `- ${s}`).join("\n")}\nNo repitas ni reformules esas ideas. Si no tienes un punto nuevo, responde con skip en true.\n\n`
    : "";
  const prompt = `Transcripción reciente de la reunión:\n${renderWindow(window)}\n\n${already}¿Qué debería hacer o preguntar el Usuario ahora?`;
  return { system, prompt };
}

// Palabras que no dicen de qué trata una Sugerencia: artículos, conectores y los verbos con que
// empiezan todas («pide», «pregunta»…). Sin ellas queda el punto del que habla.
const FILLER = new Set(
  ("antes despues después para por con sin que qué cual cuál cuales cuáles como cómo cuando cuándo donde dónde " +
    "del los las una uno unos unas sus tus este esta estos estas ese esa eso esto ahí aqui aquí hay muy mas más " +
    "pide pidele pídele pregunta preguntale pregúntale solicita confirma revisa aclara exige asegura " +
    "si tu tú su el la lo le les al de en es y o u a e ya no ni también tambien exactamente").split(" "),
);

function topicWords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9ñ]+/)
    .filter((w) => w.length >= 3 && !FILLER.has(w));
  return new Set(words.map((w) => w.slice(0, 5)));
}

/** Umbral de palabras de contenido en común (sobre la Sugerencia más corta) para tratarlas como la misma idea. */
export const SAME_IDEA_OVERLAP = 0.75;

/** ¿Dos Sugerencias hablan del mismo punto? Respaldo del Motor por si la Redacción reformula. */
export function sameIdea(a: string, b: string): boolean {
  const x = topicWords(a);
  const y = topicWords(b);
  const smaller = Math.min(x.size, y.size);
  if (smaller === 0) return a.trim().toLowerCase() === b.trim().toLowerCase();
  let common = 0;
  for (const w of x) if (y.has(w)) common++;
  return common / smaller >= SAME_IDEA_OVERLAP;
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Primeras HARD_MAX_WORDS palabras: lo que puede mostrar un delta mientras llega el texto. */
export function headWords(text: string): string {
  return text.trim().split(/\s+/).filter(Boolean).slice(0, HARD_MAX_WORDS).join(" ");
}

/** Recorta a HARD_MAX_WORDS palabras, hasta el último signo de puntuación dentro del tope. */
function clampWords(text: string): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= HARD_MAX_WORDS) return text;
  const head = words.slice(0, HARD_MAX_WORDS).join(" ");
  const cut = Math.max(...[".", "?", "!", ";", ":", ","].map((p) => head.lastIndexOf(p)));
  if (cut <= 0) return head;
  // Se conserva un cierre de frase (. ? !); una pausa (, ; :) no se deja al final.
  return /[.?!]/.test(head[cut]) ? head.slice(0, cut + 1) : head.slice(0, cut).trimEnd();
}

/** Sugerencia lista para mostrar, o null si el texto o el motivo vienen vacíos. Una que declina no se finaliza. */
export function finalizeDraft(draft: Draft): Draft | null {
  if (draft.skip) return null;
  const text = clampWords(draft.text.trim());
  const reason = draft.reason.trim().replace(/\s*\n\s*/g, " ");
  if (!text || !reason) return null;
  return { text, reason };
}

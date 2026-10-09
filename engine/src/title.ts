// Título de la Reunión (PLAN.md, tarea 28): al cerrar, el modelo propone un título corto de lo que se habló, en
// el idioma de la Reunión. El Usuario lo puede cambiar en el panel.
import { renderWindow, type WindowSegment } from "./gate";

export interface TitlePrompt {
  system: string;
  prompt: string;
}

/** Proveedor intercambiable: devuelve el texto del título tal como lo escribe el modelo. */
export type Titler = (prompt: TitlePrompt) => Promise<string>;

export const MAX_TITLE_CHARS = 80;

export function buildTitlePrompt(segments: WindowSegment[]): TitlePrompt {
  return {
    system: [
      "Le pones el título a una reunión de trabajo a partir de su transcripción.",
      "Escribe solo el título: de 3 a 8 palabras, en el idioma de la reunión, que diga de qué se habló (el tema o el acuerdo), sin comillas, sin punto final y sin nombres de personas.",
    ].join("\n"),
    prompt: `Transcripción:\n${renderWindow(segments)}`,
  };
}

/** Limpia lo que escribe el modelo: comillas, «Título:», punto final, saltos de línea; corta a 80 caracteres. */
export function cleanTitle(raw: string): string {
  let t = raw.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  t = t.replace(/^t[ií]tulo\s*:\s*/i, "");
  t = t.replace(/^["'«“”»]+|["'«“”»]+$/g, "").trim();
  t = t.replace(/[.。]+$/, "").trim();
  if (t.length > MAX_TITLE_CHARS) t = t.slice(0, MAX_TITLE_CHARS).replace(/\s+\S*$/, "").trim();
  return t;
}

import { describe, expect, test } from "bun:test";
import { buildDraftPrompt, countWords, finalizeDraft, HARD_MAX_WORDS } from "./draft";

const betty = {
  role: "CFO",
  persona: "Betty",
  objective: "Proteger la caja.",
  limits: ["legal opinions"],
  instructions: "Cuidas la caja.",
};

describe("buildDraftPrompt", () => {
  test("la Persona y las instrucciones del Rol van en el system", () => {
    const p = buildDraftPrompt(betty, [{ speaker: "counterpart", text: "Son dos millones.", t0: 0, t1: 2 }]);
    expect(p.system).toContain("Betty");
    expect(p.system).toContain("Cuidas la caja.");
    expect(p.system).toContain("entre 10 y 14 palabras");
    expect(p.system).toContain("Ejemplos");
    expect(p.prompt).toContain("[Contraparte] Son dos millones.");
  });
});

// Antes (validateDraft): más de 15 palabras se descartaban. La prueba de punta a punta del
// 2026-10-03 dio 0 Sugerencias por eso; el autor decidió tope duro de 20 con recorte.
describe("finalizeDraft", () => {
  test("deja igual una Sugerencia de hasta 20 palabras", () => {
    expect(finalizeDraft({ text: " Pregunta si ese valor incluye IVA. ", reason: "Precio sin impuestos." })).toEqual({
      text: "Pregunta si ese valor incluye IVA.",
      reason: "Precio sin impuestos.",
    });
  });

  test("con más de 20 palabras recorta al último signo de puntuación dentro del tope", () => {
    const text =
      "No acepte nada aún: pida precio total con IVA, anticipo, renovación automática, alza del 8% y moneda por escrito antes de firmar.";
    expect(countWords(text)).toBeGreaterThan(HARD_MAX_WORDS);
    expect(finalizeDraft({ text, reason: "x" })?.text).toBe(
      "No acepte nada aún: pida precio total con IVA, anticipo, renovación automática",
    );
  });

  test("conserva el signo si el corte cae en un cierre de frase (? . !)", () => {
    const text =
      "¿Los dos millones incluyen IVA y retenciones en la factura anual? Pregunta también por la moneda el plazo y el anticipo.";
    expect(finalizeDraft({ text, reason: "x" })?.text).toBe("¿Los dos millones incluyen IVA y retenciones en la factura anual?");
  });

  test("sin puntuación dentro del tope deja las primeras 20 palabras", () => {
    const text = Array.from({ length: 25 }, (_, i) => `p${i + 1}`).join(" ");
    expect(countWords(finalizeDraft({ text, reason: "x" })!.text)).toBe(HARD_MAX_WORDS);
  });

  test("motivo en una línea; texto o motivo vacíos no producen Sugerencia", () => {
    expect(finalizeDraft({ text: "Pide el desglose.", reason: "Mencionó un total\nsin detalle." })?.reason).toBe(
      "Mencionó un total sin detalle.",
    );
    expect(finalizeDraft({ text: "  ", reason: "x" })).toBeNull();
    expect(finalizeDraft({ text: "Pide el desglose.", reason: " " })).toBeNull();
  });
});

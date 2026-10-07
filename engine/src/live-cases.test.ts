// Casos reales de la prueba de punta a punta del 2026-10-03 (frases sintéticas de
// scripts/sottoly/latency/phrases.txt reproducidas por el audio del sistema; nada de una Reunión real).
// Sonnet escribió 16–19 palabras y validateDraft las descartó todas: 0 Sugerencias.
import { describe, expect, test } from "bun:test";
import { countWords, finalizeDraft, HARD_MAX_WORDS } from "./draft";

const SONNET_DRAFTS = [
  "No aceptes el anticipo aún: pregunta si 2 millones incluye IVA, qué moneda y qué garantías hay.",
  "No aceptes el anticipo aún; pregunta si 2 millones incluye IVA, en qué moneda, y si renueva automáticamente.",
  "No acepte aún: pida precio final con IVA, moneda, pago a 30 días sin anticipo y renovación manual.",
  "No acepte aún: pida precio final con IVA, moneda, anticipo, aviso de renovación y tope del aumento.",
  "No aceptes anticipo ni renovación automática aún; pide precio total con IVA, moneda, plazos y salida.",
  "No acepte nada aún: pida precio total con IVA, anticipo, renovación automática, alza del 8% y moneda por escrito.",
  "No acepte nada aún: pida precio total con IVA, moneda, calendario de pagos, y salida de renovación automática.",
  "No acepten nada aún: pidan precio total con IVA, moneda, anticipo, renovación, alza del 8% y salida por escrito.",
];

describe("Redacciones reales descartadas el 2026-10-03", () => {
  for (const [i, text] of SONNET_DRAFTS.entries()) {
    test(`caso ${i + 2}: sale una Sugerencia de máximo ${HARD_MAX_WORDS} palabras`, () => {
      const draft = finalizeDraft({ text, reason: "Precio sin aclarar impuestos ni condiciones." });
      expect(draft).not.toBeNull();
      expect(countWords(draft!.text)).toBeLessThanOrEqual(HARD_MAX_WORDS);
    });
  }
});

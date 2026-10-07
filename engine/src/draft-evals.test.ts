// Los criterios de los evals de la Redacción tienen que poder fallar: cada uno con su ejemplo malo.
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { judgeDraft, loadDraftFixtures, type DraftFixture } from "./draft-evals";

const betty = { persona: "Betty" };
const base: DraftFixture = { id: "x", role: "cfo", description: "", segments: [], previous: [], expect: { not_mention: [] } };
const ok = { text: "Pregunta si el precio incluye IVA.", reason: "Precio sin impuestos." };

describe("judgeDraft", () => {
  test("una indicación cerrada para el Usuario cumple", () => {
    expect(judgeDraft(base, betty, ok)).toEqual([]);
  });

  test("cada criterio falla con su ejemplo malo", () => {
    const fails = (text: string, f: Partial<DraftFixture> = {}) => judgeDraft({ ...base, ...f }, betty, { text, reason: "x" });
    expect(fails("¿El precio incluye IVA?")).toContain("es la pregunta textual para la Contraparte, no una indicación para el Usuario");
    expect(fails("Betty no opina sobre impuestos del tercero.").join()).toContain("tercera persona");
    expect(fails("No opino sobre temas personales, mejor sigue con la reunión.")).toContain("es una negativa escrita como Sugerencia");
    expect(fails("Pide los documentos para cumplir con")).toContain("la frase queda sin cerrar");
    expect(fails("Pregunta cómo sigue tu hijo.", { expect: { not_mention: ["hijo"] } })).toContain("menciona «hijo», fuera del Rol");
    expect(fails("Pide por escrito tu régimen tributario actual.", { previous: ["Pide por escrito cuál es tu régimen tributario actual."] })).toContain(
      "repite una Sugerencia ya mostrada",
    );
  });

  test("declinar cumple solo si no había nada que sugerir", () => {
    const skip = { skip: true, text: "", reason: "" };
    expect(judgeDraft({ ...base, expect: { skip: false, not_mention: [] } }, betty, skip)).toEqual(["declinó, y tenía algo que sugerir"]);
    expect(judgeDraft({ ...base, expect: { skip: true, not_mention: [] } }, betty, skip)).toEqual([]);
    expect(judgeDraft({ ...base, expect: { skip: true, not_mention: [] } }, betty, ok)).toEqual(["sugirió algo, y no tenía nada que decir dentro de su Rol"]);
  });

  test("los fixtures sintéticos cargan y tienen Segmentos", () => {
    const fixtures = loadDraftFixtures(join(import.meta.dir, "../../evals/draft-fixtures"));
    expect(fixtures.length).toBeGreaterThanOrEqual(5);
    expect(fixtures.every((f) => f.segments.length > 0)).toBe(true);
  });
});

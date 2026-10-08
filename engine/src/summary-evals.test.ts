// La guarda contra Decisiones inventadas y los criterios de los evals de las Decisiones (tarea 16).
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { grounded, type CandidateDecision } from "./summary";
import { judgeSummary, loadSummaryFixtures, type SummaryFixture } from "./summary-evals";

const reunion = [
  { speaker: "counterpart" as const, text: "El servicio contable anual les queda en dieciocho millones.", t0: 0, t1: 4 },
  { speaker: "user" as const, text: "Ok, suena razonable.", t0: 5, t1: 6 },
  { speaker: "counterpart" as const, text: "Les pediría un anticipo del cincuenta por ciento para empezar.", t0: 7, t1: 10 },
  { speaker: "user" as const, text: "Yo te mando los estados financieros el lunes.", t0: 11, t1: 13 },
];

const c = (kind: CandidateDecision["kind"], owner: CandidateDecision["owner"], text: string, quote: string): CandidateDecision => ({
  kind, owner, text, due: null, quote,
});

describe("grounded", () => {
  test("la Decisión inventada de la tarea 9 no pasa: el anticipo lo pidió la Contraparte, no lo dijo el Usuario", () => {
    const inventada = c("commitment", "user", "Pagar un anticipo del cincuenta por ciento.", "Les pediría un anticipo del cincuenta por ciento para empezar.");
    expect(grounded([inventada], reunion)).toEqual([]);
  });

  test("un compromiso dicho por quien se compromete pasa", () => {
    const real = c("commitment", "user", "Enviar los estados financieros el lunes.", "yo te mando los estados financieros el lunes");
    expect(grounded([real], reunion)).toEqual([real]);
  });

  test("una frase que no está en la transcripción no pasa", () => {
    expect(grounded([c("decision", "user", "Se firma hoy.", "firmamos hoy mismo")], reunion)).toEqual([]);
  });
});

describe("judgeSummary", () => {
  const base: SummaryFixture = { id: "x", description: "", segments: [], expect: { include: [], forbid: [] } };
  test("cada criterio falla con su ejemplo malo", () => {
    const d = c("commitment", "user", "Pagar el anticipo.", "q");
    expect(judgeSummary({ ...base, expect: { ...base.expect, none: true } }, [d])[0]).toContain("no se decidió nada");
    expect(judgeSummary({ ...base, expect: { ...base.expect, include: [{ kind: "decision", all: ["plan anual"], any: [] }] } }, [d])[0]).toContain("falta");
    expect(judgeSummary({ ...base, expect: { ...base.expect, forbid: [{ owner: "user", all: [], any: ["anticipo"] }] } }, [d])[0]).toContain("inventó");
    expect(judgeSummary({ ...base, expect: { ...base.expect, max: 1 } }, [d, d])[0]).toContain("más de 1");
  });

  test("los fixtures sintéticos cargan", () => {
    expect(loadSummaryFixtures(join(import.meta.dir, "../../evals/summary-fixtures")).length).toBeGreaterThanOrEqual(6);
  });
});

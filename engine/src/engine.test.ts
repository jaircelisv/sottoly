import { describe, expect, test } from "bun:test";
import { Engine, type StreamMessage, type EngineConfig, type EngineLog } from "./engine";
import type { ChoiceAnswer, ChoiceEvaluator } from "./gate";
import type { Drafter } from "./draft";
import type { Role } from "./roles";

const config: EngineConfig = {
  window_seconds: 90,
  turns: { gapSeconds: 0.7, continuousSeconds: 10 },
  antinoise: { min_seconds_between_same_role: 30, max_suggestions_per_meeting: 20 },
};

const role = (id: string, gate_option: string, persona: string, threshold: number): Role => ({
  id,
  role: id.toUpperCase(),
  persona,
  objective: "o",
  gate_option,
  gate_definition: "d",
  limits: [],
  sources: [],
  threshold,
  calibrated_with: "none",
  status: "active",
  instructions: "i",
});

const roles = [role("cfo", "cfo", "Betty", 0.75), role("ceo", "ceo_adversarial", "Sheldon", 0.85)];

/** Elige cfo cuando la ventana menciona plata; si no, none. */
const moneyGate: ChoiceEvaluator = async (state): Promise<ChoiceAnswer> =>
  /millones|IVA|precio/i.test(state)
    ? { choice: "cfo", probabilities: { cfo: 0.9 } }
    : { choice: "none", probabilities: { none: 0.95 } };

// Ideas distintas en cada llamada: el antiruido descarta la misma idea aunque cambie el texto.
const IDEAS = [
  "Pregunta si incluye IVA.",
  "Pide el calendario de pagos por escrito.",
  "Pregunta en qué moneda se factura.",
  "Pide que la renovación automática tenga aviso previo.",
];
let drafts = 0;
const drafter: Drafter = async () => ({ text: IDEAS[drafts++ % IDEAS.length], reason: "Precio sin impuestos." });

const seg = (speaker: "user" | "counterpart", t0: number, t1: number, text: string) =>
  ({ type: "segment", speaker, text, t0, t1 }) as const;

function build(overrides: Partial<{ evaluate: ChoiceEvaluator; draft: Drafter; config: EngineConfig }> = {}) {
  const logs: EngineLog[] = [];
  const stream: StreamMessage[] = [];
  const engine = new Engine({
    roles,
    evaluate: overrides.evaluate ?? moneyGate,
    draft: overrides.draft ?? drafter,
    config: overrides.config ?? config,
    log: (l) => logs.push(l),
    onStream: (m) => stream.push(m),
    now: () => 0,
  });
  return { engine, logs, stream };
}

describe("Engine", () => {
  test("emite la Sugerencia de Betty al cerrar el Turno de la Contraparte", async () => {
    const { engine } = build();
    await engine.handle({ type: "session", event: "start", roles: ["cfo", "ceo"] });
    expect(await engine.handle(seg("counterpart", 0, 3, "El plan anual cuesta dos millones."))).toEqual([]);
    const out = await engine.handle(seg("user", 3.1, 4, "Ok."));
    expect(out).toEqual([
      expect.objectContaining({ type: "suggestion", id: "s1", role: "cfo", role_label: "CFO", persona: "Betty", confidence: 0.9 }),
    ]);
  });

  test("la Redacción sale en streaming: deltas con texto acumulado y el final con el mismo id", async () => {
    const { engine, stream } = build({
      draft: async (_prompt, onText) => {
        onText?.("Pregunta si");
        onText?.("Pregunta si incluye IVA.");
        return { text: "Pregunta si incluye IVA.", reason: "Precio sin impuestos." };
      },
    });
    await engine.handle(seg("counterpart", 0, 3, "Son dos millones."));
    const [final] = await engine.handle(seg("user", 3.1, 4, "Ok."));
    expect(stream).toEqual([
      { type: "suggestion_delta", id: "s1", role: "cfo", role_label: "CFO", persona: "Betty", text: "Pregunta si" },
      { type: "suggestion_delta", id: "s1", role: "cfo", role_label: "CFO", persona: "Betty", text: "Pregunta si incluye IVA." },
    ]);
    expect(final).toMatchObject({ id: "s1", text: "Pregunta si incluye IVA.", reason: "Precio sin impuestos." });
  });

  test("los deltas no pasan de 20 palabras", async () => {
    const long = Array.from({ length: 25 }, (_, i) => `p${i + 1}`).join(" ");
    const { engine, stream } = build({
      draft: async (_prompt, onText) => {
        onText?.(long);
        return { text: long, reason: "x" };
      },
    });
    await engine.handle(seg("counterpart", 0, 3, "Son dos millones."));
    await engine.handle(seg("user", 3.1, 4, "Ok."));
    expect(stream[0]).toMatchObject({ type: "suggestion_delta" });
    expect((stream[0] as { text: string }).text.split(" ")).toHaveLength(20);
  });

  test("si la Redacción falla después de emitir deltas, se cancela la tarjeta parcial", async () => {
    const { engine, stream, logs } = build({
      draft: async (_prompt, onText) => {
        onText?.("Pregunta si");
        throw new Error("stream cortado");
      },
    });
    await engine.handle(seg("counterpart", 0, 3, "Son dos millones."));
    expect(await engine.handle(seg("user", 3.1, 4, "Ok."))).toEqual([]);
    expect(stream.at(-1)).toEqual({ type: "suggestion_cancel", id: "s1" });
    expect(logs).toContainEqual(expect.objectContaining({ event: "provider_failed", stage: "draft" }));
  });

  test("no habla cuando la Compuerta elige none", async () => {
    const { engine, logs } = build();
    await engine.handle(seg("counterpart", 0, 3, "¿Cómo estuvo el fin de semana?"));
    expect(await engine.handle({ type: "session", event: "end" })).toEqual([]);
    expect(logs.find((l) => l.event === "gate_decision")).toMatchObject({ decision: { speak: false } });
  });

  test("respeta 30 s entre Sugerencias del mismo Rol", async () => {
    const { engine, logs } = build();
    await engine.handle(seg("counterpart", 0, 3, "Son dos millones."));
    expect(await engine.handle(seg("user", 3.1, 4, "Ok."))).toHaveLength(1);
    await engine.handle(seg("counterpart", 4.1, 8, "Más IVA."));
    expect(await engine.handle(seg("user", 8.1, 9, "Ok."))).toEqual([]);
    expect(logs).toContainEqual({ event: "suggestion_suppressed", role: "cfo", reason: "cooldown" });
    await engine.handle(seg("counterpart", 40, 44, "El precio sube en marzo."));
    expect(await engine.handle(seg("user", 44.1, 45, "Ok."))).toHaveLength(1);
  });

  test("no repite una Sugerencia ya mostrada", async () => {
    const { engine, logs } = build({ draft: async () => ({ text: "Pide el desglose.", reason: "Total sin detalle." }) });
    await engine.handle(seg("counterpart", 0, 3, "Son dos millones."));
    await engine.handle(seg("user", 3.1, 4, "Ok."));
    await engine.handle(seg("counterpart", 50, 53, "El precio final es otro."));
    expect(await engine.handle(seg("user", 53.1, 54, "Ok."))).toEqual([]);
    expect(logs).toContainEqual({ event: "suggestion_suppressed", role: "cfo", reason: "repeated" });
  });

  test("aplica el tope de Sugerencias por Reunión", async () => {
    const { engine } = build({ config: { ...config, antinoise: { min_seconds_between_same_role: 0, max_suggestions_per_meeting: 1 } } });
    await engine.handle(seg("counterpart", 0, 3, "Son dos millones."));
    expect(await engine.handle(seg("user", 3.1, 4, "Ok."))).toHaveLength(1);
    await engine.handle(seg("counterpart", 5, 8, "Más IVA."));
    expect(await engine.handle(seg("user", 8.1, 9, "Ok."))).toEqual([]);
  });

  // Antes se descartaba todo lo que pasaba de 15 palabras (0 Sugerencias en la prueba de punta
  // a punta del 2026-10-03); el autor decidió recortar a 20 sin reintentos.
  test("una Redacción de más de 20 palabras se recorta al último signo y se muestra", async () => {
    const long = "Pide el desglose, el IVA y la moneda antes de aceptar uno dos tres cuatro cinco seis siete ocho nueve diez once doce";
    const { engine } = build({ draft: async () => ({ text: long, reason: "x" }) });
    await engine.handle(seg("counterpart", 0, 3, "Son dos millones."));
    const [suggestion] = await engine.handle(seg("user", 3.1, 4, "Ok."));
    expect(suggestion.text).toBe("Pide el desglose");
  });

  test("descarta una Redacción sin texto", async () => {
    const { engine, logs } = build({ draft: async () => ({ text: " ", reason: "x" }) });
    await engine.handle(seg("counterpart", 0, 3, "Son dos millones."));
    expect(await engine.handle(seg("user", 3.1, 4, "Ok."))).toEqual([]);
    expect(logs).toContainEqual({ event: "suggestion_suppressed", role: "cfo", reason: "invalid_draft" });
  });

  // Prueba de punta a punta del 2026-10-07: «Betty no opina sobre…» salió como tarjeta.
  test("si la Redacción declina, no hay Sugerencia, se quita la parcial y no es un fallo", async () => {
    const { engine, logs, stream } = build({
      draft: async (_p, onText) => {
        onText?.("Esto no es un tema de negocio");
        return { skip: true, text: "", reason: "" };
      },
    });
    await engine.handle(seg("counterpart", 0, 3, "Son dos millones."));
    expect(await engine.handle(seg("user", 3.1, 4, "Ok."))).toEqual([]);
    expect(stream.at(-1)).toEqual({ type: "suggestion_cancel", id: "s1" });
    expect(logs).toContainEqual({ event: "suggestion_suppressed", role: "cfo", reason: "declined" });
    expect(logs.some((l) => l.event === "provider_failed")).toBe(false);
  });

  test("declinar no gasta el tiempo mínimo del Rol: la siguiente Sugerencia sale", async () => {
    let n = 0;
    const { engine } = build({
      draft: async () => (++n === 1 ? { skip: true, text: "", reason: "" } : { text: "Pregunta si incluye IVA.", reason: "Precio sin impuestos." }),
    });
    const out = [];
    for (const s of [seg("counterpart", 0, 3, "Son dos millones."), seg("user", 3.1, 4, "Ok."), seg("counterpart", 5, 8, "Más IVA.")]) {
      out.push(...(await engine.handle(s)));
    }
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe("Pregunta si incluye IVA.");
  });

  test("si falla el proveedor de la Compuerta, no se cae y registra el error", async () => {
    const { engine, logs } = build({ evaluate: async () => { throw new Error("timeout"); } });
    await engine.handle(seg("counterpart", 0, 3, "Son dos millones."));
    expect(await engine.handle(seg("user", 3.1, 4, "Ok."))).toEqual([]);
    expect(logs).toContainEqual({ event: "provider_failed", stage: "gate", error: "Error: timeout" });
  });

  test("la ventana de la Compuerta no incluye Segmentos posteriores al Turno evaluado", async () => {
    const seen: string[] = [];
    const { engine } = build({ evaluate: async (state) => { seen.push(state); return { choice: "none", probabilities: { none: 1 } }; } });
    await engine.handle(seg("counterpart", 0, 3, "Primero."));
    await engine.handle(seg("user", 3.1, 4, "Después."));
    expect(seen[0]).toContain("Primero.");
    expect(seen[0]).not.toContain("Después.");
  });

  test("la sesión solo activa Roles pedidos y activos", async () => {
    const seen: string[] = [];
    const { engine } = build({
      evaluate: async (_s, q) => { seen.push(Object.keys(q.criteria).join(",")); return { choice: "none", probabilities: { none: 1 } }; },
    });
    await engine.handle({ type: "session", event: "start", roles: ["cfo"] });
    await engine.handle(seg("counterpart", 0, 3, "x"));
    await engine.handle({ type: "session", event: "end" });
    expect(seen).toEqual(["none,cfo"]);
  });
});

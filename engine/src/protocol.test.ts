import { describe, expect, test } from "bun:test";
import { encodeOutbound, parseInbound } from "./protocol";

describe("parseInbound", () => {
  test("acepta un Segmento de la Contraparte", () => {
    const r = parseInbound('{"type":"segment","speaker":"counterpart","text":"Son dos millones","t0":125.3,"t1":128.6}');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.message).toMatchObject({ type: "segment", speaker: "counterpart" });
  });

  test("acepta speaker mixed", () => {
    expect(parseInbound('{"type":"segment","speaker":"mixed","text":"x","t0":0,"t1":1}').ok).toBe(true);
  });

  test("rechaza speakers fuera del glosario", () => {
    expect(parseInbound('{"type":"segment","speaker":"ellos","text":"x","t0":0,"t1":1}').ok).toBe(false);
  });

  test("rechaza un Segmento con t1 < t0", () => {
    expect(parseInbound('{"type":"segment","speaker":"user","text":"x","t0":5,"t1":4}').ok).toBe(false);
  });

  test("acepta inicio de sesión con ids de Rol", () => {
    const r = parseInbound('{"type":"session","event":"start","roles":["cfo","ceo"]}');
    expect(r.ok).toBe(true);
  });

  test("acepta el latido clock", () => {
    expect(parseInbound('{"type":"clock","t":131.2}').ok).toBe(true);
  });

  test("no lanza con JSON inválido", () => {
    expect(parseInbound("{no es json")).toEqual({ ok: false, error: "invalid JSON" });
  });

  test("rechaza tipos desconocidos", () => {
    expect(parseInbound('{"type":"turn","event":"close"}').ok).toBe(false);
  });
});

describe("encodeOutbound", () => {
  test("serializa una Sugerencia como una línea JSONL", () => {
    const line = encodeOutbound({
      type: "suggestion",
      id: "s1",
      role: "cfo",
      role_label: "CFO",
      persona: "Betty",
      text: "Pregunta si ese valor incluye IVA.",
      reason: "Mencionó un precio sin aclarar impuestos.",
      confidence: 0.82,
    });
    expect(line.endsWith("\n")).toBe(true);
    expect(line.trim().includes("\n")).toBe(false);
    expect(JSON.parse(line)).toMatchObject({ role: "cfo", role_label: "CFO" });
  });

  test("rechaza una Sugerencia sin role_label (nombre visible del Rol)", () => {
    expect(() =>
      encodeOutbound({ type: "suggestion", role: "cfo", persona: "Betty", text: "x", reason: "y", confidence: 0.5 } as never),
    ).toThrow();
    expect(() =>
      encodeOutbound({ type: "suggestion", id: "s1", role: "cfo", role_label: "", persona: "Betty", text: "x", reason: "y", confidence: 0.5 }),
    ).toThrow();
  });

  // El id une los deltas, el final y la cancelación; Rust (engine_bridge) lo exige (PLAN.md, tarea 4).
  test("el id de la Sugerencia es obligatorio y no vacío", () => {
    expect(() =>
      encodeOutbound({ type: "suggestion", role: "cfo", role_label: "CFO", persona: "Betty", text: "x", reason: "y", confidence: 0.5 } as never),
    ).toThrow();
    expect(() =>
      encodeOutbound({ type: "suggestion", id: "", role: "cfo", role_label: "CFO", persona: "Betty", text: "x", reason: "y", confidence: 0.5 }),
    ).toThrow();
  });

  test("serializa un delta de Redacción (texto acumulado, sin motivo) y una cancelación", () => {
    const delta = encodeOutbound({ type: "suggestion_delta", id: "s1", role: "cfo", role_label: "CFO", persona: "Betty", text: "Pregunta si" });
    expect(JSON.parse(delta)).toEqual({ type: "suggestion_delta", id: "s1", role: "cfo", role_label: "CFO", persona: "Betty", text: "Pregunta si" });
    expect(JSON.parse(encodeOutbound({ type: "suggestion_cancel", id: "s1" }))).toEqual({ type: "suggestion_cancel", id: "s1" });
  });

  test("rechaza una confianza fuera de [0, 1]", () => {
    expect(() =>
      encodeOutbound({ type: "suggestion", id: "s1", role: "cfo", role_label: "CFO", persona: "Betty", text: "x", reason: "y", confidence: 1.5 }),
    ).toThrow();
  });

  test("serializa un resumen con Decisiones", () => {
    const line = encodeOutbound({
      type: "summary",
      decisions: [
        {
          id: "d1",
          kind: "commitment",
          text: "El contador envía la declaración el viernes.",
          owner: "counterpart",
          due: "2026-10-09",
          source: "engine",
          meeting_id: "m1",
          created_at: "2026-10-04T15:00:00Z",
          approved: false,
        },
      ],
    });
    expect(JSON.parse(line).decisions).toHaveLength(1);
  });
});

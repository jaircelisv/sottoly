import { describe, expect, test } from "bun:test";
import { buildTitlePrompt, cleanTitle } from "./title";
import { Engine } from "./engine";
import type { Role } from "./roles";

const seg = (speaker: "user" | "counterpart", t0: number, text: string) => ({ type: "segment" as const, speaker, text, t0, t1: t0 + 3 });

describe("buildTitlePrompt (tarea 28)", () => {
  test("lleva la transcripción y pide un título corto en el idioma de la Reunión", () => {
    const p = buildTitlePrompt([seg("counterpart", 0, "El servicio contable anual cuesta dieciocho millones.")]);
    expect(p.prompt).toContain("servicio contable anual");
    expect(p.system).toMatch(/título/i);
    expect(p.system).toMatch(/idioma de la reunión/i);
  });
});

describe("cleanTitle", () => {
  test("quita comillas, punto final, «Título:» y espacios de más", () => {
    expect(cleanTitle("«Cotización del servicio contable anual.»")).toBe("Cotización del servicio contable anual");
    expect(cleanTitle('Título: "Plan de pagos con el proveedor"\n')).toBe("Plan de pagos con el proveedor");
  });
  test("corta un título larguísimo y descarta uno vacío", () => {
    expect(cleanTitle("palabra ".repeat(40)).length).toBeLessThanOrEqual(80);
    expect(cleanTitle("  \n ")).toBe("");
  });
});

const cfo: Role = {
  id: "cfo", role: "CFO", persona: "Betty", objective: "o", gate_option: "cfo", gate_definition: "d", limits: [], sources: [],
  threshold: 0.7, calibrated_with: "none", status: "active", instructions: "i",
};
const config = { window_seconds: 90, turns: { gapSeconds: 0.7, continuousSeconds: 10 }, antinoise: { min_seconds_between_same_role: 30, max_suggestions_per_meeting: 20 } };

function build(title?: () => Promise<string>) {
  const logs: any[] = [];
  const engine = new Engine({
    roles: [cfo],
    evaluate: async () => ({ choice: "none", probabilities: { none: 1 } }),
    draft: async () => ({ text: "x", reason: "y" }),
    config,
    summarize: async () => [],
    ...(title ? { title } : {}),
    log: (l) => logs.push(l),
    now: () => 0,
  });
  return { engine, logs };
}

describe("el cierre trae el título (tarea 28)", () => {
  test("el summary lleva el título que propone el modelo, limpio", async () => {
    const { engine } = build(async () => "«Cotización del servicio contable.»");
    await engine.handle({ type: "session", event: "start", roles: ["cfo"] });
    await engine.handle(seg("counterpart", 0, "El servicio contable anual cuesta dieciocho millones."));
    expect((await engine.close())?.title).toBe("Cotización del servicio contable");
  });

  test("si el modelo del título falla, la Reunión se cierra igual, sin título, y queda en el log", async () => {
    const { engine, logs } = build(async () => {
      throw new Error("caído");
    });
    await engine.handle({ type: "session", event: "start", roles: ["cfo"] });
    await engine.handle(seg("counterpart", 0, "El servicio contable anual cuesta dieciocho millones."));
    const summary = await engine.close();
    expect(summary?.type).toBe("summary");
    expect(summary?.title).toBeUndefined();
    expect(logs).toContainEqual(expect.objectContaining({ event: "provider_failed", stage: "title" }));
  });
});

import { describe, expect, test } from "bun:test";
import { applyLevel, withLevels } from "./levels";
import type { Role } from "./roles";

describe("applyLevel (tarea 30)", () => {
  test("«Solo lo importante» es el umbral calibrado; «Equilibrado» y «Más seguido» lo bajan, nunca de 0.5", () => {
    expect(applyLevel(0.7, "important")).toBe(0.7);
    expect(applyLevel(0.7, "balanced")).toBeCloseTo(0.6);
    expect(applyLevel(0.7, "often")).toBeCloseTo(0.5);
    expect(applyLevel(0.6, "often")).toBe(0.5);
  });
});

describe("withLevels", () => {
  const role = (id: string, threshold: number): Role => ({
    id, role: id, persona: id, objective: "o", gate_option: id, gate_definition: "d", limits: [], sources: [],
    threshold, calibrated_with: "evals", status: "active", instructions: "i",
  });
  test("cambia solo el umbral de los Roles que tienen nivel, sin tocar lo calibrado", () => {
    const roles = [role("cfo", 0.7), role("ceo", 0.75)];
    const out = withLevels(roles, { cfo: "often" });
    expect(out.map((r) => r.threshold)).toEqual([0.5, 0.75]);
    expect(out[0]!.calibrated_with).toBe("evals");
    expect(roles[0]!.threshold).toBe(0.7);
  });
  test("un nivel desconocido se ignora", () => {
    expect(withLevels([role("cfo", 0.7)], { cfo: "siempre" as any })[0]!.threshold).toBe(0.7);
  });
});

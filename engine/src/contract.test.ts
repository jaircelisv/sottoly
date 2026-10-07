// Contrato App ↔ Motor generado desde Zod (PLAN.md, tarea 3).
import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateSchema, isSchemaFresh, loadExamples, SCHEMA_PATH, zodAccepts } from "./contract";

describe("JSON Schema del protocolo", () => {
  test("cubre los siete mensajes del protocolo", () => {
    const texto = JSON.stringify(generateSchema());
    for (const tipo of ["segment", "session", "clock", "suggestion", "suggestion_delta", "suggestion_cancel", "summary"]) {
      expect(texto).toContain(`"${tipo}"`);
    }
  });

  test("el schema versionado es el que genera Zod", () => {
    expect(isSchemaFresh(SCHEMA_PATH)).toBe(true);
  });

  test("detecta un schema desactualizado", () => {
    const viejo = join(mkdtempSync(join(tmpdir(), "sottoly-schema-")), "protocol.schema.json");
    writeFileSync(viejo, JSON.stringify({ inbound: {}, outbound: {} }));
    expect(isSchemaFresh(viejo)).toBe(false);
  });
});

describe("mensajes de ejemplo", () => {
  const ejemplos = loadExamples();

  test("cubren los siete tipos en su dirección", () => {
    const vistos = new Set(ejemplos.filter((e) => e.valid).map((e) => `${e.direction}:${(e.message as { type: string }).type}`));
    for (const t of ["inbound:segment", "inbound:session", "inbound:clock", "outbound:suggestion", "outbound:suggestion_delta", "outbound:suggestion_cancel", "outbound:summary"]) {
      expect(vistos.has(t)).toBe(true);
    }
  });

  test("Zod acepta los válidos y rechaza los inválidos", () => {
    for (const e of ejemplos) expect({ ejemplo: e.message, zod: zodAccepts(e.direction, e.message) }).toEqual({ ejemplo: e.message, zod: e.valid });
  });
});

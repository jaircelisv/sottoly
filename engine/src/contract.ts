// Contrato App ↔ Motor generado desde Zod (fuente única: protocol.ts).
//   bun src/contract.ts --write     escribe contract/protocol.schema.json
//   bun src/contract.ts --check     sale con 1 si el schema versionado no es el que genera Zod
//   bun src/contract.ts --validate  lee {direction, message} por stdin (JSONL) y responde {zod} por línea
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { InboundMessage, OutboundMessage } from "./protocol";

export type Direction = "inbound" | "outbound";

export const CONTRACT_DIR = join(import.meta.dir, "../contract");
export const SCHEMA_PATH = join(CONTRACT_DIR, "protocol.schema.json");
export const EXAMPLES_PATH = join(CONTRACT_DIR, "examples.jsonl");

export function generateSchema() {
  return {
    $comment: "Generado desde engine/src/protocol.ts con `bun src/contract.ts --write`. No editar a mano.",
    inbound: z.toJSONSchema(InboundMessage),
    outbound: z.toJSONSchema(OutboundMessage),
  };
}

export function renderSchema(): string {
  return JSON.stringify(generateSchema(), null, 2) + "\n";
}

export function isSchemaFresh(path: string): boolean {
  return existsSync(path) && readFileSync(path, "utf8") === renderSchema();
}

export interface Example {
  direction: Direction;
  valid: boolean;
  message: unknown;
}

export function loadExamples(path = EXAMPLES_PATH): Example[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Example);
}

export function zodAccepts(direction: Direction, message: unknown): boolean {
  return (direction === "inbound" ? InboundMessage : OutboundMessage).safeParse(message).success;
}

if (import.meta.main) {
  const modo = process.argv[2];
  if (modo === "--write") {
    writeFileSync(SCHEMA_PATH, renderSchema());
  } else if (modo === "--check") {
    if (!isSchemaFresh(SCHEMA_PATH)) {
      console.error("contract/protocol.schema.json no es el que genera Zod: corre `bun src/contract.ts --write`.");
      process.exit(1);
    }
  } else if (modo === "--validate") {
    for (const linea of (await Bun.stdin.text()).split("\n")) {
      if (!linea.trim()) continue;
      const { direction, message } = JSON.parse(linea) as { direction: Direction; message: unknown };
      console.log(JSON.stringify({ zod: zodAccepts(direction, message) }));
    }
  } else {
    console.error("uso: bun src/contract.ts --write | --check | --validate");
    process.exit(2);
  }
}

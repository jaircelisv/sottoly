import { describe, expect, test } from "bun:test";
import { buildChatPrompt, cleanReply } from "./chat";
import { Engine, type StreamMessage } from "./engine";
import type { Role } from "./roles";

const betty: Role = {
  id: "cfo",
  role: "CFO",
  persona: "Betty",
  objective: "Proteger la caja.",
  gate_option: "cfo",
  gate_definition: "d",
  limits: [],
  sources: [],
  threshold: 0.7,
  calibrated_with: "none",
  status: "active",
  instructions: "Cuidas la caja.",
};

describe("buildChatPrompt (tarea 23: respuestas cortas, sin presentarse)", () => {
  test("pide respuestas cortas y que el Rol no se presente: el chat ya muestra quién habla", () => {
    const { system } = buildChatPrompt(betty, [], "¿Qué opinas?");
    expect(system).toMatch(/no te presentes/i);
    expect(system).toMatch(/lista corta/i);
  });
});

describe("cleanReply", () => {
  test("quita el saludo con el nombre del Rol al inicio, con o sin negrita", () => {
    expect(cleanReply("**Betty aquí:** Están vendiendo un curso.", "Betty")).toBe("Están vendiendo un curso.");
    expect(cleanReply("Betty aquí: ojo con el anticipo.", "Betty")).toBe("ojo con el anticipo.");
    expect(cleanReply("**Sheldon:** No hay datos.", "Sheldon")).toBe("No hay datos.");
  });

  test("no toca el nombre en medio de la respuesta ni otras negritas", () => {
    expect(cleanReply("Como CFO, Betty diría que **antes de pagar** pidas el detalle.", "Betty")).toBe(
      "Como CFO, Betty diría que **antes de pagar** pidas el detalle.",
    );
  });
});

test("el Motor manda la respuesta del chat ya limpia, también mientras llega", async () => {
  const stream: StreamMessage[] = [];
  const engine = new Engine({
    roles: [betty],
    evaluate: async () => ({ choice: "none", probabilities: { none: 1 } }),
    draft: async () => ({ text: "x", reason: "y" }),
    config: { window_seconds: 90, turns: { gapSeconds: 0.7, continuousSeconds: 10 }, antinoise: { min_seconds_between_same_role: 30, max_suggestions_per_meeting: 20 } },
    onStream: (m) => stream.push(m),
    chat: async (_p, onText) => {
      onText?.("**Betty aquí:** Están");
      onText?.("**Betty aquí:** Están vendiendo un **curso**.");
      return "**Betty aquí:** Están vendiendo un **curso**.";
    },
    now: () => 0,
  });
  await engine.handle({ type: "session", event: "start", roles: ["cfo"] });
  await engine.handle({ type: "chat", id: "c1", role: "cfo", text: "¿Qué vende?" });
  await Bun.sleep(10);
  const textos = stream.filter((m) => m.type === "chat_delta" || m.type === "chat_reply").map((m: any) => m.text);
  expect(textos).toEqual(["Están", "Están vendiendo un **curso**.", "Están vendiendo un **curso**."]);
});

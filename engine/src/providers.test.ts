// La Redacción con la respuesta real de Anthropic grabada (evals/recordings/anthropic-draft-response.json):
// el servidor simulado la corta igual que la API cuando max_tokens no alcanza (stop_reason "max_tokens").
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import config from "../config.json";
import { buildDraftPrompt } from "./draft";
import { anthropicDrafter } from "./providers";
import { loadRoles } from "./roles";

const ROOT = join(import.meta.dir, "../..");
const recorded = await Bun.file(join(ROOT, "evals/recordings/anthropic-draft-response.json")).json();
const cfo = loadRoles(join(ROOT, "roles")).find((r) => r.id === "cfo")!;
const prompt = buildDraftPrompt(cfo, recorded.window);
const needed: number = recorded.response.usage.output_tokens;

/** API simulada: devuelve la respuesta grabada, cortada si `max_tokens` no alcanza. */
const recordedApi = (async (_url: string, init: RequestInit) => {
  const { max_tokens } = JSON.parse(String(init.body));
  const response = structuredClone(recorded.response);
  if (max_tokens < needed) {
    const full: string = response.content[0].text;
    response.content[0].text = full.slice(0, Math.floor((full.length * max_tokens) / needed));
    response.stop_reason = "max_tokens";
    response.usage.output_tokens = max_tokens;
  }
  return new Response(JSON.stringify(response), { headers: { "content-type": "application/json" } });
}) as unknown as typeof fetch;

describe("Redacción con la respuesta real grabada", () => {
  test(`max_tokens de config.json alcanza para una Redacción real (${needed} tokens)`, async () => {
    const draft = await anthropicDrafter(config.draft.model, config.draft.max_tokens, recordedApi)(prompt);
    expect(draft.text).toContain("IVA");
    expect(draft.reason.length).toBeGreaterThan(0);
  });

  test("una respuesta cortada por max_tokens no produce Redacción", async () => {
    const draft = anthropicDrafter(config.draft.model, needed - 10, recordedApi)(prompt);
    await expect(draft).rejects.toThrow();
  });
});

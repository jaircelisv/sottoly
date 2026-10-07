// La Redacción en streaming con el stream SSE real de Anthropic grabado
// (evals/recordings/anthropic-draft-stream.sse, Haiku 4.5, Reunión sintética contador-iva).
// La API simulada lo corta igual que la real cuando max_tokens no alcanza (stop_reason "max_tokens").
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import config from "../config.json";
import { buildDraftPrompt } from "./draft";
import { loadFixtures } from "./evals";
import { anthropicDrafter } from "./providers";
import { loadRoles } from "./roles";

const ROOT = join(import.meta.dir, "../..");
const sse = await Bun.file(join(ROOT, "evals/recordings/anthropic-draft-stream.sse")).text();
const events = sse.split("\n\n").filter((e) => e.trim());
const deltas = events.filter((e) => e.includes('"content_block_delta"'));
const needed = Number([...sse.matchAll(/"output_tokens":(\d+)/g)].at(-1)![1]);
const window = loadFixtures(join(ROOT, "evals/fixtures")).find((f) => f.id === "contador-iva")!.segments.slice(0, 3);
const prompt = buildDraftPrompt(loadRoles(join(ROOT, "roles")).find((r) => r.id === "cfo")!, window);

/** Corta el stream como la API cuando max_tokens no alcanza. */
function truncated(maxTokens: number): string {
  const keep = deltas.slice(0, Math.floor((deltas.length * maxTokens) / needed));
  const head = events.filter((e) => /message_start|content_block_start/.test(e));
  const tail = [
    'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}',
    `event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"max_tokens","stop_sequence":null},"usage":{"output_tokens":${maxTokens}}}`,
    'event: message_stop\ndata: {"type":"message_stop"}',
  ];
  return [...head, ...keep, ...tail].join("\n\n") + "\n\n";
}

const recordedApi = (async (_url: string, init: RequestInit) => {
  const { max_tokens } = JSON.parse(String(init.body));
  const body = max_tokens < needed ? truncated(max_tokens) : sse;
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}) as unknown as typeof fetch;

describe("Redacción en streaming con el stream real grabado", () => {
  test(`con max_tokens de config.json sale la Redacción completa (${needed} tokens)`, async () => {
    const partials: string[] = [];
    const draft = await anthropicDrafter(config.draft.model, config.draft.max_tokens, recordedApi)(prompt, (t) => partials.push(t));
    expect(draft.text).toContain("IVA");
    expect(draft.reason.length).toBeGreaterThan(0);
    // El texto llega por partes y cada parte extiende la anterior.
    expect(partials.length).toBeGreaterThan(1);
    for (let i = 1; i < partials.length; i++) expect(partials[i].startsWith(partials[i - 1])).toBe(true);
    expect(partials.at(-1)).toBe(draft.text);
  });

  test("una respuesta cortada por max_tokens no produce Redacción", async () => {
    await expect(anthropicDrafter(config.draft.model, needed - 10, recordedApi)(prompt)).rejects.toThrow();
  });
});

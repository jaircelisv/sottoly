// Sonda del título de la Reunión para el gate (PLAN.md, tarea 28). Lee por stdin { "modelo": "<texto>" | null }:
// arma una Reunión corta y la cierra con el modelo del título simulado (texto, o `null` = la API falla).
// Devuelve el título del `summary`, si llegó el `summary` y si cumple el protocolo.
import { join } from "node:path";
import config from "../config.json";
import { Engine } from "../src/engine";
import * as providers from "../src/providers";
import { OutboundMessage } from "../src/protocol";
import { loadRoles } from "../src/roles";

const ROOT = join(import.meta.dir, "../..");
const { modelo } = JSON.parse(await Bun.stdin.text()) as { modelo: string | null };

const api = (async () => {
  if (modelo === null) return new Response('{"type":"error","error":{"type":"api_error","message":"caído"}}', { status: 500, headers: { "content-type": "application/json" } });
  return Response.json({
    id: "msg_sonda", type: "message", role: "assistant", model: config.draft.model,
    content: [{ type: "text", text: modelo }],
    stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 },
  });
}) as unknown as typeof fetch;

const crear = (providers as Record<string, any>).anthropicTitler;
const title = typeof crear === "function" ? crear(config.draft.model, 40, api) : undefined;
const engine = new Engine({
  roles: loadRoles(join(ROOT, "roles")),
  evaluate: async () => ({ choice: "none", probabilities: { none: 0.99 } }),
  draft: async () => ({ skip: true, text: "", reason: "" }),
  config,
  summarize: async () => [],
  ...(title ? { title } : {}),
} as any);

await engine.handle({ type: "session", event: "start" });
await engine.handle({ type: "segment", speaker: "counterpart", text: "El servicio contable anual les queda en dieciocho millones.", t0: 0, t1: 4 });
await engine.handle({ type: "segment", speaker: "user", text: "¿Eso incluye el IVA?", t0: 5, t1: 7 });
await engine.handle({ type: "session", event: "end" });
const summary = (await engine.close()) as any;
console.log(JSON.stringify({
  summary: Boolean(summary),
  titulo: summary?.title ?? null,
  cumple_el_protocolo: summary ? OutboundMessage.safeParse(summary).success : false,
}));

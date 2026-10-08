// Sonda del chat con el Rol para el gate (PLAN.md, tarea 13). Lee por stdin
//   { "pregunta": "…", "role": "cfo", "responde_a_la_sugerencia": false, "modelo": "<texto>" | null }
// Reunión corta con una Sugerencia de Betty (s1); luego el Usuario escribe en el chat. El modelo
// del chat es la API de Anthropic simulada (texto en streaming; `modelo: null` = la API falla).
import { join } from "node:path";
import config from "../config.json";
import * as engineModule from "../src/engine";
import * as providers from "../src/providers";
import { OutboundMessage } from "../src/protocol";
import { loadRoles } from "../src/roles";
import { sse } from "./sse";

const ROOT = join(import.meta.dir, "../..");
const e = JSON.parse(await Bun.stdin.text()) as { pregunta: string; role: string; responde_a_la_sugerencia: boolean; modelo: string | null };

const TRANSCRIPCION = "El servicio contable anual les queda en dieciocho millones.";
const SUGERENCIA = "Pregunta si los dieciocho millones incluyen IVA.";

let peticion = "";
const api = (async (_url: string, init: RequestInit) => {
  peticion = String(init.body);
  if (e.modelo === null) return new Response('{"type":"error","error":{"type":"api_error","message":"caído"}}', { status: 500, headers: { "content-type": "application/json" } });
  return new Response(sse(e.modelo, 6), { headers: { "content-type": "text/event-stream" } });
}) as unknown as typeof fetch;

const crear = (providers as Record<string, any>).anthropicChatter;
const chat = typeof crear === "function" ? crear(config.draft.model, 400, api) : undefined;
const salida: unknown[] = [];
const engine = new engineModule.Engine({
  roles: loadRoles(join(ROOT, "roles")),
  evaluate: async () => ({ choice: "cfo", probabilities: { cfo: 0.99 } }),
  draft: async () => ({ skip: false, text: SUGERENCIA, reason: "Precio sin impuestos." }),
  config,
  onStream: (m: unknown) => salida.push(m),
  ...(chat ? { chat } : {}),
} as any);

await engine.handle({ type: "session", event: "start", roles: ["cfo", "ceo"] });
await engine.handle({ type: "segment", speaker: "counterpart", text: TRANSCRIPCION, t0: 0, t1: 4 });
salida.push(...(await engine.handle({ type: "segment", speaker: "user", text: "Ajá.", t0: 5, t1: 6 })));

const mensaje = { type: "chat", id: "c1", role: e.role, text: e.pregunta, ...(e.responde_a_la_sugerencia ? { reply_to: "s1" } : {}) };
try {
  salida.push(...(await engine.handle(mensaje as any)));
} catch {
  // un mensaje que el Motor no entiende no cuenta como respuesta
}

const delChat = salida.filter((m: any) => typeof m?.type === "string" && m.type.startsWith("chat_")) as any[];
const final = delChat.findIndex((m) => m.type === "chat_reply");
const deltas = delChat.filter((m) => m.type === "chat_delta");
console.log(JSON.stringify({
  respuesta: final >= 0,
  error: delChat.some((m) => m.type === "chat_error" && m.id === "c1"),
  deltas_antes_del_final: final > 0 && deltas.length > 0 && delChat.slice(0, final).every((m) => m.type === "chat_delta"),
  mismo_id: delChat.length > 0 && delChat.every((m) => m.id === "c1"),
  ve_la_transcripcion: peticion.includes("dieciocho millones"),
  ve_la_sugerencia: peticion.includes(SUGERENCIA),
  cumple_el_protocolo: salida.every((m) => OutboundMessage.safeParse(m).success),
}));

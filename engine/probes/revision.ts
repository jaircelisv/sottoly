// Sonda de la revisión de una Reunión terminada para el gate (PLAN.md, tarea 29). Lee por stdin
//   { "pregunta": "…", "modelo": "<texto del chat>" }
// abre una sesión en modo `review`, le pasa la transcripción guardada y pregunta en el chat (la API de Anthropic
// simulada). Devuelve cuántas veces se llamó a la Compuerta, si llegó la respuesta, si el modelo vio la
// transcripción y si al cerrar salió un `summary` (en revisión no debe: las Decisiones ya se revisaron).
import { join } from "node:path";
import config from "../config.json";
import { Engine } from "../src/engine";
import * as providers from "../src/providers";
import { InboundMessage, OutboundMessage } from "../src/protocol";
import { loadRoles } from "../src/roles";
import { sse } from "./sse";

const ROOT = join(import.meta.dir, "../..");
const e = JSON.parse(await Bun.stdin.text()) as { pregunta: string; modelo: string };

let peticion = "";
const api = (async (_url: string, init: RequestInit) => {
  peticion = String(init.body);
  return new Response(sse(e.modelo, 6), { headers: { "content-type": "text/event-stream" } });
}) as unknown as typeof fetch;

let compuerta = 0;
const salida: unknown[] = [];
const engine = new Engine({
  roles: loadRoles(join(ROOT, "roles")),
  evaluate: async () => {
    compuerta++;
    return { choice: "cfo", probabilities: { cfo: 0.99 } };
  },
  draft: async () => ({ skip: false, text: "Pregunta si incluye IVA.", reason: "Precio." }),
  summarize: async () => [{ kind: "decision", text: "x", owner: "user", due: null, quote: "x" }],
  chat: providers.anthropicChatter(config.chat.model, 400, api),
  config,
  onStream: (m: unknown) => salida.push(m),
} as any);

const mensajes = [
  { type: "session", event: "start", roles: ["cfo", "ceo"], mode: "review" },
  { type: "segment", speaker: "counterpart", text: "El servicio anual les queda en dieciocho millones con IVA aparte.", t0: 0, t1: 4 },
  { type: "segment", speaker: "user", text: "Lo pienso y te confirmo el lunes.", t0: 5, t1: 8 },
  { type: "clock", t: 60 },
];
let protocolo = true;
for (const m of mensajes) {
  const ok = InboundMessage.safeParse(m);
  if (!ok.success) protocolo = false;
  salida.push(...(await engine.handle(m as any)));
}
await engine.handle({ type: "chat", id: "c1", role: "cfo", text: e.pregunta });
await engine.handle({ type: "session", event: "end" });
const cierre = await engine.close();

console.log(JSON.stringify({
  llamadas_a_la_compuerta: compuerta,
  respuesta: salida.some((m: any) => m?.type === "chat_reply" && m.id === "c1"),
  ve_la_transcripcion: peticion.includes("dieciocho millones"),
  summary_al_cerrar: Boolean(cierre),
  cumple_el_protocolo: protocolo && salida.every((m) => OutboundMessage.safeParse(m).success),
}));

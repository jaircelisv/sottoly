// Sonda del cierre de la Reunión para el gate (PLAN.md, tarea 9). Lee por stdin
//   { "modelo": "<JSON que devuelve el modelo con las Decisiones>", "con_segmentos": true }
// arma una Reunión corta, la cierra y cuenta lo que el Motor manda: el `summary` y si cumple el protocolo.
import { join } from "node:path";
import config from "../config.json";
import * as engineModule from "../src/engine";
import * as providers from "../src/providers";
import { OutboundMessage } from "../src/protocol";
import { loadRoles } from "../src/roles";

const ROOT = join(import.meta.dir, "../..");
const { modelo, con_segmentos = true } = JSON.parse(await Bun.stdin.text()) as { modelo: string; con_segmentos?: boolean };

let llamadas = 0;
const api = (async () => {
  llamadas++;
  return Response.json({
    id: "msg_sonda", type: "message", role: "assistant", model: config.draft.model,
    content: [{ type: "text", text: modelo }],
    stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 },
  });
}) as unknown as typeof fetch;

const crear = (providers as Record<string, any>).anthropicSummarizer;
const summarize = typeof crear === "function" ? crear(config.draft.model, 1024, api) : undefined;
const engine = new engineModule.Engine({
  roles: loadRoles(join(ROOT, "roles")),
  evaluate: async () => ({ choice: "none", probabilities: { none: 0.99 } }),
  draft: async () => ({ skip: true, text: "", reason: "" }),
  config,
  ...(summarize ? { summarize } : {}),
} as any);

await engine.handle({ type: "session", event: "start" });
if (con_segmentos) {
  await engine.handle({ type: "segment", speaker: "counterpart", text: "Entonces cerramos el plan anual por dos millones más IVA.", t0: 0, t1: 4 });
  await engine.handle({ type: "segment", speaker: "user", text: "De acuerdo, me mandas la factura el viernes.", t0: 5, t1: 8 });
  await engine.handle({ type: "segment", speaker: "counterpart", text: "Sí, te mando la factura el viernes.", t0: 9, t1: 11 });
}
const salida: unknown[] = [...(await engine.handle({ type: "session", event: "end" }))];
const cerrar = (engine as any).close;
if (typeof cerrar === "function") {
  const summary = await cerrar.call(engine);
  if (summary) salida.push(summary);
}

const summary = salida.find((m: any) => m?.type === "summary") as any;
console.log(JSON.stringify({
  summary: Boolean(summary),
  decisiones: summary?.decisions?.length ?? 0,
  todas_sin_aprobar: (summary?.decisions ?? []).every((d: any) => d.approved === false),
  cumple_el_protocolo: salida.every((m) => OutboundMessage.safeParse(m).success),
  llamadas_al_modelo: llamadas,
}));

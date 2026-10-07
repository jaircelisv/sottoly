// Sonda de la Redacción para el gate (PLAN.md, tarea 7). Lee un escenario JSON por stdin:
//   { "modelo": "<JSON que escribe el modelo>", "trozo": 6 }
// y lo pasa por la cadena real —API de Anthropic simulada en SSE → anthropicDrafter → Engine—
// con los Roles de roles/ y una Compuerta que siempre elige al CFO. Imprime lo que vería el overlay.
import { join } from "node:path";
import config from "../config.json";
import { Engine, type EngineLog, type StreamMessage } from "../src/engine";
import { anthropicDrafter } from "../src/providers";
import { loadRoles } from "../src/roles";
import { sse } from "./sse";

const ROOT = join(import.meta.dir, "../..");
const escenario = JSON.parse(await Bun.stdin.text()) as { modelo: string; trozo?: number };

let peticion: any = null;
const api = (async (_url: string, init: RequestInit) => {
  peticion = JSON.parse(String(init.body));
  return new Response(sse(escenario.modelo, escenario.trozo ?? 6), { headers: { "content-type": "text/event-stream" } });
}) as unknown as typeof fetch;

const flujo: StreamMessage[] = [];
const registro: EngineLog[] = [];
const engine = new Engine({
  roles: loadRoles(join(ROOT, "roles")),
  evaluate: async () => ({ choice: "cfo", probabilities: { cfo: 0.99 } }),
  draft: anthropicDrafter(config.draft.model, config.draft.max_tokens, api),
  config: { ...config, antinoise: config.antinoise },
  log: (e) => registro.push(e),
  onStream: (m) => flujo.push(m),
});

await engine.handle({ type: "session", event: "start" });
await engine.handle({ type: "segment", speaker: "counterpart", text: "El servicio cuesta dos millones al mes.", t0: 0, t1: 3 });
const sugerencias = await engine.handle({ type: "segment", speaker: "user", text: "Ajá.", t0: 5, t1: 6 });

const ultimoDelta = flujo.findLastIndex((m) => m.type === "suggestion_delta");
const ultimoCancel = flujo.findLastIndex((m) => m.type === "suggestion_cancel");
console.log(JSON.stringify({
  sugerencias: sugerencias.length,
  hubo_parciales: ultimoDelta >= 0,
  tarjeta_quitada: ultimoDelta < 0 || ultimoCancel > ultimoDelta,
  fallo_del_proveedor: registro.some((e) => e.event === "provider_failed"),
  esquema: peticion?.output_format?.schema ?? peticion?.output_config?.format?.schema ?? peticion?.tools?.[0]?.input_schema ?? Object.keys(peticion ?? {}),
  sistema: Array.isArray(peticion?.system) ? peticion.system.map((b: any) => b.text).join("\n") : String(peticion?.system ?? ""),
}));

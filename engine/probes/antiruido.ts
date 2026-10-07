// Sonda del antiruido para el gate (PLAN.md, tarea 8). Lee por stdin { "redacciones": ["<JSON>", …] }:
// cada Turno la Contraparte habla de plata, la Compuerta elige al CFO y el modelo escribe la
// siguiente redacción. Los Turnos van separados más que el tiempo mínimo entre Sugerencias del Rol.
import { join } from "node:path";
import config from "../config.json";
import { Engine } from "../src/engine";
import { anthropicDrafter } from "../src/providers";
import { loadRoles } from "../src/roles";
import { sse } from "./sse";

const ROOT = join(import.meta.dir, "../..");
const { redacciones } = JSON.parse(await Bun.stdin.text()) as { redacciones: string[] };

const peticiones: string[] = [];
let n = 0;
const api = (async (_url: string, init: RequestInit) => {
  const body = JSON.parse(String(init.body));
  peticiones.push(JSON.stringify(body.messages ?? []) + JSON.stringify(body.system ?? ""));
  return new Response(sse(redacciones[n++] ?? '{"skip":true,"text":"","reason":""}', 8), { headers: { "content-type": "text/event-stream" } });
}) as unknown as typeof fetch;

const engine = new Engine({
  roles: loadRoles(join(ROOT, "roles")),
  evaluate: async () => ({ choice: "cfo", probabilities: { cfo: 0.99 } }),
  draft: anthropicDrafter(config.draft.model, config.draft.max_tokens, api),
  config,
});

const mostradas: string[] = [];
await engine.handle({ type: "session", event: "start" });
const paso = config.antinoise.min_seconds_between_same_role + 10;
for (let i = 0; i < redacciones.length; i++) {
  const t = i * paso;
  await engine.handle({ type: "segment", speaker: "counterpart", text: `Hablemos de impuestos y del costo mensual, punto ${i + 1}.`, t0: t, t1: t + 3 });
  for (const s of await engine.handle({ type: "segment", speaker: "user", text: "Ajá.", t0: t + 4, t1: t + 5 })) mostradas.push(s.text);
}

// ¿La petición de cada redacción lleva las Sugerencias que ya se mostraron?
const ven = mostradas.length > 0 && peticiones.slice(1).every((p, i) => mostradas.slice(0, Math.min(i + 1, mostradas.length)).every((m) => p.includes(m)));
console.log(JSON.stringify({ sugerencias: mostradas.length, mostradas, la_redaccion_ve_las_anteriores: ven }));

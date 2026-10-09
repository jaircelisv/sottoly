// Sonda del eco en el Motor para el gate (PLAN.md, tarea 26). Lee por stdin
//   { "segmentos": [{ "speaker": "user" | "counterpart", "text": "…", "t0": 0, "t1": 2 }, …] }
// y los pasa por el Motor con una Compuerta que anota cada ventana que ve. Devuelve qué frases del Usuario
// vio la Compuerta la última vez y cuántos descartes por eco quedaron en el log.
import { join } from "node:path";
import config from "../config.json";
import { Engine } from "../src/engine";
import { loadRoles } from "../src/roles";

const ROOT = join(import.meta.dir, "../..");
const { segmentos } = JSON.parse(await Bun.stdin.text()) as {
  segmentos: { speaker: "user" | "counterpart"; text: string; t0: number; t1: number }[];
};

const ventanas: string[] = [];
const logs: { event: string }[] = [];
const engine = new Engine({
  roles: loadRoles(join(ROOT, "roles")),
  evaluate: async (state: string) => {
    ventanas.push(state);
    return { choice: "none", probabilities: { none: 0.99 } };
  },
  draft: async () => ({ skip: true, text: "", reason: "" }),
  config,
  log: (l: { event: string }) => logs.push(l),
} as any);

await engine.handle({ type: "session", event: "start", roles: ["cfo", "ceo"] });
for (const s of segmentos) await engine.handle({ type: "segment", ...s });
await engine.handle({ type: "clock", t: Math.max(0, ...segmentos.map((s) => s.t1)) + 30 });
await engine.handle({ type: "session", event: "end" } as any);

const ultima = ventanas.at(-1) ?? "";
console.log(
  JSON.stringify({
    la_compuerta_vio_del_usuario: ultima
      .split("\n")
      .filter((l) => l.includes("[Usuario]"))
      .map((l) => l.slice(l.indexOf("[Usuario]") + "[Usuario]".length).trim()),
    descartes_por_eco_en_el_log: logs.filter((l) => l.event === "echo_dropped").length,
  }),
);

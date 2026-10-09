// Sonda del nivel de intervención para el gate (PLAN.md, tarea 30). Lee por stdin
//   { "nivel": "important" | "balanced" | "often" | null, "probabilidad": 0.65 }
// con los Roles de roles/ y una Compuerta que elige al CFO con esa probabilidad. Devuelve si el CFO habla.
import { join } from "node:path";
import config from "../config.json";
import { Engine } from "../src/engine";
import { loadRoles } from "../src/roles";

const ROOT = join(import.meta.dir, "../..");
const { nivel, probabilidad } = JSON.parse(await Bun.stdin.text()) as { nivel: string | null; probabilidad: number };

const engine = new Engine({
  roles: loadRoles(join(ROOT, "roles")),
  evaluate: async () => ({ choice: "cfo", probabilities: { cfo: probabilidad } }),
  draft: async () => ({ skip: false, text: "Pregunta si incluye IVA.", reason: "Precio." }),
  config,
  levels: () => (nivel ? { cfo: nivel } : {}),
} as any);

await engine.handle({ type: "session", event: "start", roles: ["cfo"] });
const salida = [
  ...(await engine.handle({ type: "segment", speaker: "counterpart", text: "Son dieciocho millones.", t0: 0, t1: 3 })),
  ...(await engine.handle({ type: "segment", speaker: "user", text: "Ok.", t0: 4, t1: 5 })),
  ...(await engine.handle({ type: "session", event: "end" })),
];
console.log(JSON.stringify({ habla: salida.some((m: any) => m?.type === "suggestion") }));

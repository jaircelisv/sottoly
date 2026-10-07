// Contrato App ↔ Motor para el gate: une lo que dice Zod (engine/src/contract.ts) con lo que
// dice Rust (frontend/src-tauri/examples/contract.rs, los mismos structs del puente).
//   contrato_integro()  → regla gate/reglas/integridad-del-protocolo.json
//   aceptan(mensaje)    → { zod, rust } para un mensaje del Motor (gate/casos/04-…)
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));
const ENGINE = join(RAIZ, "engine");
const TAURI = join(RAIZ, "frontend", "src-tauri");

function correr(cmd, args, cwd, entrada = "") {
  const r = spawnSync(cmd, args, { cwd, input: entrada, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw r.error;
  return r;
}

function lineasJson(texto) {
  return texto.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
}

/** Veredicto de Zod para cada {direction, message}. */
function zod(items) {
  const r = correr("bun", ["src/contract.ts", "--validate"], ENGINE, items.map((i) => JSON.stringify(i)).join("\n") + "\n");
  if (r.status !== 0) throw new Error(`Zod no respondió: ${r.stderr}`);
  return lineasJson(r.stdout).map((x) => x.zod);
}

/** Veredicto de Rust (EngineEvent del puente) para cada mensaje del Motor. */
function rustOutbound(mensajes) {
  const r = correr("cargo", ["run", "-q", "--example", "contract", "--", "outbound"], TAURI, mensajes.map((m) => JSON.stringify(m)).join("\n") + "\n");
  if (r.status !== 0) throw new Error(`Rust no respondió: ${r.stderr.slice(-2000)}`);
  return lineasJson(r.stdout).map((x) => x.rust);
}

/** Mensajes que Rust produce hacia el Motor. */
function rustInbound() {
  const r = correr("cargo", ["run", "-q", "--example", "contract", "--", "inbound"], TAURI);
  if (r.status !== 0) throw new Error(`Rust no respondió: ${r.stderr.slice(-2000)}`);
  return lineasJson(r.stdout);
}

export function aceptan(mensaje) {
  const [z] = zod([{ direction: "outbound", message: mensaje }]);
  const [rust] = rustOutbound([mensaje]);
  return { zod: z, rust };
}

export function contrato_integro() {
  // 1. El JSON Schema versionado es el que genera Zod.
  if (correr("bun", ["src/contract.ts", "--check"], ENGINE).status !== 0) return false;

  const ejemplos = readFileSync(join(ENGINE, "contract", "examples.jsonl"), "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));

  // 2. Zod da el veredicto esperado en cada ejemplo.
  const veredictosZod = zod(ejemplos.map(({ direction, message }) => ({ direction, message })));
  if (ejemplos.some((e, i) => veredictosZod[i] !== e.valid)) return false;

  // 3. Del Motor a la App: Rust acepta exactamente lo mismo que Zod.
  const salientes = ejemplos.filter((e) => e.direction === "outbound");
  const veredictosRust = rustOutbound(salientes.map((e) => e.message));
  if (salientes.some((e, i) => veredictosRust[i] !== e.valid)) return false;

  // 4. De la App al Motor: todo lo que Rust produce lo acepta Zod.
  const producidos = rustInbound();
  if (producidos.length === 0) return false;
  return zod(producidos.map((message) => ({ direction: "inbound", message }))).every(Boolean);
}

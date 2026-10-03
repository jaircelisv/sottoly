// Motor (sidecar): lee mensajes por stdin y escribe Sugerencias por stdout, una línea JSON por mensaje.
// Los registros (decisiones de la Compuerta, errores) van por stderr para no ensuciar el protocolo.
import { join } from "node:path";
import config from "../config.json";
import type { Draft } from "./draft";
import { Engine } from "./engine";
import { Recordings, recordingDrafter, recordingEvaluator, recordingKey, replayDrafter, replayEvaluator } from "./evals";
import { encodeOutbound, parseInbound } from "./protocol";
import { anthropicDrafter, jevEvaluator } from "./providers";
import { loadRoles } from "./roles";

// En el binario compilado no hay carpeta de fuentes: la App pasa la ruta de roles/.
const ROLES_DIR = process.env.SOTTOLY_ROLES_DIR ?? join(import.meta.dir, "../../roles");
const RECORDINGS_DIR = process.env.SOTTOLY_RECORDINGS_DIR ?? join(import.meta.dir, "../../evals/recordings");

/**
 * SOTTOLY_PROVIDERS: `live` (por defecto, modelos reales), `recorded` (respuestas grabadas, sin keys:
 * pruebas de integración) o `record` (Jev grabado si existe, si no real; Redacción real; guarda todo).
 */
function providers() {
  const mode = process.env.SOTTOLY_PROVIDERS ?? "live";
  const gateModel = config.gate.model;
  const draftModel = config.draft.model;
  if (mode === "live") {
    return { evaluate: jevEvaluator(gateModel), draft: anthropicDrafter(draftModel, config.draft.max_tokens), save() {} };
  }
  const gate = new Recordings(join(RECORDINGS_DIR, `${gateModel}.json`));
  const drafts = new Recordings<Draft>(join(RECORDINGS_DIR, `${draftModel}.json`));
  if (mode === "recorded") {
    return { evaluate: replayEvaluator(gateModel, gate), draft: replayDrafter(draftModel, drafts), save() {} };
  }
  if (mode !== "record") throw new Error(`SOTTOLY_PROVIDERS desconocido: ${mode}`);
  const replay = replayEvaluator(gateModel, gate);
  const record = recordingEvaluator(gateModel, jevEvaluator(gateModel), gate);
  return {
    evaluate: ((state, question) =>
      gate.get(recordingKey(gateModel, state, question)) ? replay(state, question) : record(state, question)) as typeof replay,
    draft: recordingDrafter(draftModel, anthropicDrafter(draftModel, config.draft.max_tokens), drafts),
    save() {
      gate.save();
      drafts.save();
    },
  };
}

function log(entry: Record<string, unknown>) {
  process.stderr.write(JSON.stringify({ ...entry, at: new Date().toISOString() }) + "\n");
}

async function main() {
  const { evaluate, draft, save } = providers();
  const engine = new Engine({ roles: loadRoles(ROLES_DIR), evaluate, draft, config, log });

  for await (const line of console) {
    if (!line.trim()) continue;
    const parsed = parseInbound(line);
    if (!parsed.ok) {
      log({ level: "warn", event: "invalid_message", error: parsed.error });
      continue;
    }
    for (const suggestion of await engine.handle(parsed.message)) {
      process.stdout.write(encodeOutbound(suggestion));
    }
  }
  for (const suggestion of await engine.handle({ type: "session", event: "end" })) {
    process.stdout.write(encodeOutbound(suggestion));
  }
  save();
}

main();

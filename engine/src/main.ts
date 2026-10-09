// Motor (sidecar): lee mensajes por stdin y escribe Sugerencias por stdout, una línea JSON por mensaje.
// Los registros (decisiones de la Compuerta, errores) van por stderr para no ensuciar el protocolo.
import { join } from "node:path";
import config from "../config.json";
import type { Draft } from "./draft";
import { Engine } from "./engine";
import {
  Recordings,
  recordingDrafter,
  recordingEvaluator,
  recordingKey,
  recordingSummarizer,
  replayDrafter,
  replayEvaluator,
  replaySummarizer,
} from "./evals";
import { encodeOutbound, parseInbound } from "./protocol";
import { anthropicChatter, anthropicDeduper, anthropicDrafter, anthropicSummarizer, anthropicTitler, jevEvaluator } from "./providers";
import type { CandidateDecision } from "./summary";
import { buildDedupePrompt } from "./dedupe";
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
  const summaryModel = config.summary.model;
  const liveSummarizer = () => anthropicSummarizer(summaryModel, config.summary.max_tokens);
  if (mode === "live") {
    return {
      evaluate: jevEvaluator(gateModel),
      draft: anthropicDrafter(draftModel, config.draft.max_tokens),
      summarize: liveSummarizer(),
      chat: anthropicChatter(config.chat.model, config.chat.max_tokens),
      title: anthropicTitler(config.title.model, config.title.max_tokens),
      dedupe: (candidate: string, previous: string[]) => anthropicDeduper(draftModel)(buildDedupePrompt(candidate, previous)),
      save() {},
    };
  }
  const gate = new Recordings(join(RECORDINGS_DIR, `${gateModel}.json`));
  const drafts = new Recordings<Draft>(join(RECORDINGS_DIR, `${draftModel}.json`));
  const summaries = new Recordings<CandidateDecision[]>(join(RECORDINGS_DIR, `${summaryModel}-summary.json`));
  if (mode === "recorded") {
    return {
      evaluate: replayEvaluator(gateModel, gate),
      draft: replayDrafter(draftModel, drafts),
      summarize: replaySummarizer(summaryModel, summaries),
      save() {},
    };
  }
  if (mode !== "record") throw new Error(`SOTTOLY_PROVIDERS desconocido: ${mode}`);
  const replay = replayEvaluator(gateModel, gate);
  const record = recordingEvaluator(gateModel, jevEvaluator(gateModel), gate);
  return {
    evaluate: ((state, question) =>
      gate.get(recordingKey(gateModel, state, question)) ? replay(state, question) : record(state, question)) as typeof replay,
    draft: recordingDrafter(draftModel, anthropicDrafter(draftModel, config.draft.max_tokens), drafts),
    summarize: recordingSummarizer(summaryModel, liveSummarizer(), summaries),
    save() {
      gate.save();
      drafts.save();
      summaries.save();
    },
  };
}

function log(entry: Record<string, unknown>) {
  process.stderr.write(JSON.stringify({ ...entry, at: new Date().toISOString() }) + "\n");
}

async function main() {
  const { evaluate, draft, summarize, save, ...rest } = providers();
  // El chat y el juez de paráfrasis solo con modelos reales: grabados, no hay.
  const chat = "chat" in rest ? rest.chat : undefined;
  const dedupe = "dedupe" in rest ? rest.dedupe : undefined;
  const title = "title" in rest ? rest.title : undefined;
  const engine = new Engine({
    roles: loadRoles(ROLES_DIR),
    evaluate,
    draft,
    summarize,
    chat,
    dedupe,
    title,
    // Grabaciones y pruebas fijan la fecha: va en el prompt de las Decisiones y en su clave.
    today: process.env.SOTTOLY_TODAY ? () => process.env.SOTTOLY_TODAY! : undefined,
    config,
    log,
    onStream: (message) => process.stdout.write(encodeOutbound(message)),
  });

  for await (const line of console) {
    if (!line.trim()) continue;
    const parsed = parseInbound(line);
    if (!parsed.ok) {
      log({ level: "warn", event: "invalid_message", error: parsed.error });
      continue;
    }
    // El chat no frena la Reunión: su respuesta sale por onStream mientras siguen llegando Segmentos.
    if (parsed.message.type === "chat") {
      void engine.handle(parsed.message);
      continue;
    }
    for (const suggestion of await engine.handle(parsed.message)) {
      process.stdout.write(encodeOutbound(suggestion));
    }
  }
  for (const suggestion of await engine.handle({ type: "session", event: "end" })) {
    process.stdout.write(encodeOutbound(suggestion));
  }
  // Al cerrar la Reunión (EOF), las Decisiones candidatas (SPEC §6).
  const summary = await engine.close();
  if (summary) process.stdout.write(encodeOutbound(summary));
  save();
}

main();

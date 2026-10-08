// Orquestador del Motor: Segmentos → Turnos → Compuerta → Redacción → Sugerencia (SPEC §4).
// Sin E/S: los proveedores se inyectan, así el pipeline completo se prueba con respuestas grabadas.
import { evaluateGate, slideWindow, type ChoiceEvaluator, type GateDecision, type WindowSegment } from "./gate";
import { buildDraftPrompt, finalizeDraft, headWords, sameIdea, type Drafter } from "./draft";
import { buildChatPrompt, type Chatter, type ChatTurn } from "./chat";
import type {
  ChatDelta,
  ChatError,
  ChatMessage,
  ChatReply,
  InboundMessage,
  SuggestionCancel,
  SuggestionDelta,
  SuggestionMessage,
  SummaryMessage,
} from "./protocol";
import { buildSummaryPrompt, toDecisions, type Summarizer } from "./summary";
import { selectBoard, type Role } from "./roles";
import { TurnAssembler, type TurnEvent, type TurnOptions } from "./turns";

export interface EngineConfig {
  window_seconds: number;
  turns: TurnOptions;
  antinoise: {
    /** Mínimo de segundos de audio entre Sugerencias del mismo Rol. */
    min_seconds_between_same_role: number;
    max_suggestions_per_meeting: number;
  };
}

export type EngineLog =
  | { event: "gate_decision"; trigger: TurnEvent["kind"]; turn: number; decision: GateDecision; latency_ms: number }
  | { event: "suggestion_suppressed"; role: string; reason: SuppressReason }
  | { event: "provider_failed"; stage: "gate" | "draft" | "summary" | "chat"; error: string };

export type SuppressReason = "cooldown" | "repeated" | "meeting_cap" | "invalid_draft" | "declined";

/** Lo que sale mientras se redacta, antes del final que devuelve `handle`. */
export type StreamMessage = SuggestionDelta | SuggestionCancel | ChatDelta | ChatReply | ChatError;

export interface EngineDeps {
  roles: Role[];
  evaluate: ChoiceEvaluator;
  draft: Drafter;
  config: EngineConfig;
  log?: (entry: EngineLog) => void;
  /** Decisiones candidatas al cerrar la Reunión (SPEC §6). Sin él, la Reunión se cierra sin `summary`. */
  summarize?: Summarizer;
  /** Chat con el Rol (tarea 13). Sin él, cada pregunta recibe chat_error. Las respuestas salen por `onStream`. */
  chat?: Chatter;
  /** Fecha de hoy (AAAA-MM-DD) para las fechas de los compromisos; fija en grabaciones y pruebas. */
  today?: () => string;
  /** Deltas y cancelaciones de la Redacción en streaming (la App los manda a la tarjeta al momento). */
  onStream?: (message: StreamMessage) => void;
  now?: () => number;
}

export class Engine {
  private board: Role[] = [];
  private segments: WindowSegment[] = [];
  private turns: TurnAssembler;
  private lastByRole = new Map<string, number>();
  private shown: string[] = [];
  private suggestionCount = 0;
  private draftCount = 0;
  private meetingId: string = crypto.randomUUID();
  private suggestionText = new Map<string, string>();
  private chatHistory = new Map<string, ChatTurn[]>();

  constructor(private readonly deps: EngineDeps) {
    this.turns = new TurnAssembler(deps.config.turns);
    this.board = selectBoard(deps.roles, undefined);
  }

  /** Procesa un mensaje de la App y devuelve las Sugerencias que hay que mostrar. */
  async handle(message: InboundMessage): Promise<SuggestionMessage[]> {
    switch (message.type) {
      case "session":
        if (message.event === "start") {
          this.reset(message.roles);
          return [];
        }
        return this.process(this.turns.flush());
      case "segment":
        this.segments.push(message);
        return this.process(this.turns.push(message));
      case "clock":
        return this.process(this.turns.tick(message.t));
      case "chat":
        await this.answer(message);
        return [];
    }
  }

  private reset(roles: string[] | undefined) {
    this.board = selectBoard(this.deps.roles, roles);
    this.segments = [];
    this.turns = new TurnAssembler(this.deps.config.turns);
    this.lastByRole.clear();
    this.shown = [];
    this.suggestionCount = 0;
    this.draftCount = 0;
    this.meetingId = crypto.randomUUID();
    this.suggestionText.clear();
    this.chatHistory.clear();
  }

  /** Responde en el chat como el Rol pedido, en streaming. Sin Rol en la junta o si falla el modelo: chat_error. */
  private async answer(message: ChatMessage) {
    const emit = (m: ChatDelta | ChatReply | ChatError) => this.deps.onStream?.(m);
    const role = this.board.find((r) => r.id === message.role);
    if (!role || !this.deps.chat) {
      emit({ type: "chat_error", id: message.id });
      return;
    }
    const history = this.chatHistory.get(role.id) ?? [];
    const prompt = buildChatPrompt(role, this.segments, message.text, {
      replyTo: message.reply_to ? this.suggestionText.get(message.reply_to) : undefined,
      history,
    });
    let last = "";
    try {
      const text = (
        await this.deps.chat(prompt, (acc) => {
          const t = acc.trim();
          if (!t || t === last) return;
          last = t;
          emit({ type: "chat_delta", id: message.id, role: role.id, text: t });
        })
      ).trim();
      if (!text) throw new Error("respuesta vacía");
      this.chatHistory.set(role.id, [...history, { question: message.text, answer: text }]);
      emit({ type: "chat_reply", id: message.id, role: role.id, text });
    } catch (error) {
      this.deps.log?.({ event: "provider_failed", stage: "chat", error: String(error) });
      emit({ type: "chat_error", id: message.id });
    }
  }

  /**
   * Cierra la Reunión: las Decisiones candidatas en un `summary`, ninguna aprobada. Sin Segmentos no se
   * llama al modelo; si el modelo falla, se registra y la Reunión se cierra sin `summary`.
   */
  async close(): Promise<SummaryMessage | null> {
    if (!this.deps.summarize || this.segments.length === 0) return null;
    const now = new Date();
    const today = this.deps.today?.() ?? now.toISOString().slice(0, 10);
    try {
      const candidates = await this.deps.summarize(buildSummaryPrompt(this.segments, today));
      return { type: "summary", decisions: toDecisions(candidates, this.meetingId, now.toISOString()) };
    } catch (error) {
      this.deps.log?.({ event: "provider_failed", stage: "summary", error: String(error) });
      return null;
    }
  }

  private async process(events: TurnEvent[]): Promise<SuggestionMessage[]> {
    const out: SuggestionMessage[] = [];
    for (const event of events) {
      const suggestion = await this.evaluate(event);
      if (suggestion) out.push(suggestion);
    }
    return out;
  }

  private async evaluate(event: TurnEvent): Promise<SuggestionMessage | null> {
    const window = slideWindow(
      this.segments.filter((s) => s.t1 <= event.turn.t1),
      this.deps.config.window_seconds,
    );
    const now = this.deps.now ?? (() => performance.now());

    let decision: GateDecision;
    const started = now();
    try {
      decision = await evaluateGate(window, this.board, this.deps.evaluate);
    } catch (error) {
      this.deps.log?.({ event: "provider_failed", stage: "gate", error: String(error) });
      return null;
    }
    this.deps.log?.({
      event: "gate_decision",
      trigger: event.kind,
      turn: event.turn.index,
      decision,
      latency_ms: Math.round(now() - started),
    });
    if (!decision.speak) return null;

    const role = this.board.find((r) => r.id === decision.role)!;
    const { antinoise } = this.deps.config;
    if (this.suggestionCount >= antinoise.max_suggestions_per_meeting) {
      return this.suppress(role.id, "meeting_cap");
    }
    const last = this.lastByRole.get(role.id);
    if (last !== undefined && event.turn.t1 - last < antinoise.min_seconds_between_same_role) {
      return this.suppress(role.id, "cooldown");
    }

    const id = `s${++this.draftCount}`;
    const header = { id, role: role.id, role_label: role.role, persona: role.persona };
    let shown = "";
    const onText = (text: string) => {
      const head = headWords(text);
      if (!head || head === shown) return;
      shown = head;
      this.deps.onStream?.({ type: "suggestion_delta", ...header, text: head });
    };
    // Si ya hubo deltas y no sale el final, la tarjeta parcial se quita.
    const cancel = () => {
      if (shown) this.deps.onStream?.({ type: "suggestion_cancel", id });
    };

    let raw;
    try {
      raw = await this.deps.draft(buildDraftPrompt(role, window, this.shown), onText);
    } catch (error) {
      this.deps.log?.({ event: "provider_failed", stage: "draft", error: String(error) });
      cancel();
      return null;
    }
    if (raw.skip) {
      cancel();
      return this.suppress(role.id, "declined");
    }
    const draft = finalizeDraft(raw);
    if (!draft) {
      cancel();
      return this.suppress(role.id, "invalid_draft");
    }

    if (this.shown.some((s) => sameIdea(s, draft.text))) {
      cancel();
      return this.suppress(role.id, "repeated");
    }

    this.shown.push(draft.text);
    this.suggestionText.set(id, draft.text);
    this.lastByRole.set(role.id, event.turn.t1);
    this.suggestionCount++;
    return {
      type: "suggestion",
      ...header,
      text: draft.text,
      reason: draft.reason,
      confidence: decision.probability,
    };
  }

  private suppress(role: string, reason: SuppressReason): null {
    this.deps.log?.({ event: "suggestion_suppressed", role, reason });
    return null;
  }
}

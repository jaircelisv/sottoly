// Protocolo App ↔ Motor: una línea JSON por mensaje (SPEC §4).
// Claves y enums en inglés; el contenido humano va en el idioma de la Reunión.
import { z } from "zod";

export const Speaker = z.enum(["user", "counterpart", "mixed"]);
export type Speaker = z.infer<typeof Speaker>;

const RoleId = z.string().regex(/^[a-z][a-z0-9_]*$/);

// app → engine

export const SegmentMessage = z
  .object({
    type: z.literal("segment"),
    speaker: Speaker,
    text: z.string(),
    t0: z.number().nonnegative(),
    t1: z.number().nonnegative(),
  })
  .refine((m) => m.t1 >= m.t0, { message: "t1 must be >= t0" });

export const SessionMessage = z.object({
  type: z.literal("session"),
  event: z.enum(["start", "end"]),
  roles: z.array(RoleId).optional(),
  /**
   * `live` (por defecto): la Reunión en curso. `review` (tarea 29): una Reunión ya terminada que se carga para
   * conversar con la junta; sus Segmentos no pasan por la Compuerta y al cerrar no hay `summary`.
   */
  mode: z.enum(["live", "review"]).optional(),
});

export const ClockMessage = z.object({
  type: z.literal("clock"),
  t: z.number().nonnegative(),
});

/** El Usuario le escribe a un Rol durante la Reunión (tarea 13). `reply_to`: la Sugerencia que responde. */
export const ChatMessage = z.object({
  type: z.literal("chat"),
  id: z.string().min(1),
  role: RoleId,
  text: z.string().min(1),
  reply_to: z.string().min(1).optional(),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

export const InboundMessage = z.union([SegmentMessage, SessionMessage, ClockMessage, ChatMessage]);
export type InboundMessage = z.infer<typeof InboundMessage>;

// engine → app

/** Id de una Sugerencia: lo comparten sus deltas, el final y la cancelación. */
const SuggestionId = z.string().min(1);

export const SuggestionMessage = z.object({
  type: z.literal("suggestion"),
  // Une los deltas, el final y la cancelación; Rust (engine_bridge) lo exige.
  id: SuggestionId,
  role: RoleId,
  /** Nombre visible del Rol (campo `role` del frontmatter), para la tarjeta del overlay. */
  role_label: z.string().min(1),
  persona: z.string().min(1),
  text: z.string().min(1),
  reason: z.string().min(1),
  confidence: z.number().min(0).max(1),
});
export type SuggestionMessage = z.infer<typeof SuggestionMessage>;

export const Decision = z.object({
  id: z.string().min(1),
  kind: z.enum(["decision", "commitment"]),
  text: z.string().min(1),
  owner: z.enum(["user", "counterpart"]),
  due: z.string().nullable(),
  source: z.enum(["engine", "live_mark"]),
  meeting_id: z.string().min(1),
  created_at: z.string().min(1),
  approved: z.boolean(),
});
export type Decision = z.infer<typeof Decision>;

export const SummaryMessage = z.object({
  type: z.literal("summary"),
  /** Título que propone el modelo (tarea 28). Falta si el modelo del título falló. */
  title: z.string().min(1).max(120).optional(),
  decisions: z.array(Decision),
});
export type SummaryMessage = z.infer<typeof SummaryMessage>;

/** Redacción en curso: `text` es el texto acumulado (no un trozo); el final lo reemplaza. */
export const SuggestionDelta = z.object({
  type: z.literal("suggestion_delta"),
  id: SuggestionId,
  role: RoleId,
  role_label: z.string().min(1),
  persona: z.string().min(1),
  text: z.string().min(1),
});
export type SuggestionDelta = z.infer<typeof SuggestionDelta>;

/** La Redacción que ya emitió deltas no termina en Sugerencia: la tarjeta parcial se quita. */
export const SuggestionCancel = z.object({
  type: z.literal("suggestion_cancel"),
  id: SuggestionId,
});
export type SuggestionCancel = z.infer<typeof SuggestionCancel>;

/** Respuesta del Rol en el chat, en streaming: `text` es el acumulado; el `chat_reply` la cierra. */
export const ChatDelta = z.object({
  type: z.literal("chat_delta"),
  id: z.string().min(1),
  role: RoleId,
  text: z.string().min(1),
});
export type ChatDelta = z.infer<typeof ChatDelta>;

export const ChatReply = z.object({
  type: z.literal("chat_reply"),
  id: z.string().min(1),
  role: RoleId,
  text: z.string().min(1),
});
export type ChatReply = z.infer<typeof ChatReply>;

/** El Rol no pudo responder (no está en la junta, o falló el modelo). */
export const ChatError = z.object({
  type: z.literal("chat_error"),
  id: z.string().min(1),
});
export type ChatError = z.infer<typeof ChatError>;

export const OutboundMessage = z.union([
  SuggestionMessage,
  SuggestionDelta,
  SuggestionCancel,
  SummaryMessage,
  ChatDelta,
  ChatReply,
  ChatError,
]);
export type OutboundMessage = z.infer<typeof OutboundMessage>;

export type ParseResult =
  | { ok: true; message: InboundMessage }
  | { ok: false; error: string };

/** Parsea una línea de stdin. Nunca lanza: una línea inválida no debe tumbar el Motor. */
export function parseInbound(line: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return { ok: false, error: "invalid JSON" };
  }
  const result = InboundMessage.safeParse(raw);
  if (!result.success) return { ok: false, error: result.error.issues.map((i) => i.message).join("; ") };
  return { ok: true, message: result.data };
}

/** Serializa un mensaje de salida como una línea JSONL, validándolo antes. */
export function encodeOutbound(message: OutboundMessage): string {
  return JSON.stringify(OutboundMessage.parse(message)) + "\n";
}

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
});

export const ClockMessage = z.object({
  type: z.literal("clock"),
  t: z.number().nonnegative(),
});

export const InboundMessage = z.union([SegmentMessage, SessionMessage, ClockMessage]);
export type InboundMessage = z.infer<typeof InboundMessage>;

// engine → app

/** Id de una Sugerencia: lo comparten sus deltas, el final y la cancelación. */
const SuggestionId = z.string().min(1);

export const SuggestionMessage = z.object({
  type: z.literal("suggestion"),
  // El Motor siempre lo manda; opcional mientras el overlay y su modo demo no manejen deltas.
  id: SuggestionId.optional(),
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
  decisions: z.array(Decision),
});

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

export const OutboundMessage = z.union([SuggestionMessage, SuggestionDelta, SuggestionCancel, SummaryMessage]);
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

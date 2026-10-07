// Contrato del evento `suggestion`: el mismo SuggestionMessage del protocolo App ↔ Motor.
import { SuggestionCancel, SuggestionDelta, SuggestionMessage } from "../../engine/src/protocol";

export type { SuggestionCancel, SuggestionDelta, SuggestionMessage };

/** Valida el payload del evento; null si no cumple el protocolo. */
export function parseSuggestion(payload: unknown): SuggestionMessage | null {
  const result = SuggestionMessage.safeParse(payload);
  return result.success ? result.data : null;
}

/** Valida un `suggestion_delta` (texto acumulado de la Redacción en curso); null si no cumple. */
export function parseDelta(payload: unknown): SuggestionDelta | null {
  const result = SuggestionDelta.safeParse(payload);
  return result.success ? result.data : null;
}

/** Valida un `suggestion_cancel`; null si no cumple. */
export function parseCancel(payload: unknown): SuggestionCancel | null {
  const result = SuggestionCancel.safeParse(payload);
  return result.success ? result.data : null;
}

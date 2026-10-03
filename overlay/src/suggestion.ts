// Contrato del evento `suggestion`: el mismo SuggestionMessage del protocolo App ↔ Motor.
import { SuggestionMessage } from "../../engine/src/protocol";

export type { SuggestionMessage };

/** Valida el payload del evento; null si no cumple el protocolo. */
export function parseSuggestion(payload: unknown): SuggestionMessage | null {
  const result = SuggestionMessage.safeParse(payload);
  return result.success ? result.data : null;
}

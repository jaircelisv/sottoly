// Compuerta: decide si un Rol habla y cuál (SPEC §4). Elige Roles, nunca Personas.
import type { Speaker } from "./protocol";

export const NONE_OPTION = "none";

/** Lo que la Compuerta necesita de un Rol. La Persona no entra aquí a propósito. */
export interface GateRole {
  id: string;
  gate_option: string;
  gate_definition: string;
  threshold: number;
}

export interface WindowSegment {
  speaker: Speaker;
  text: string;
  t0: number;
  t1: number;
}

/** Pregunta tipo Choice: opción → definición. */
export interface ChoiceQuestion {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
}

export interface ChoiceAnswer {
  choice: string;
  probabilities?: Record<string, number>;
}

/** Proveedor intercambiable (Jev, o Haiku como respaldo). */
export type ChoiceEvaluator = (state: string, question: ChoiceQuestion) => Promise<ChoiceAnswer>;

export type GateDecision =
  | { speak: false; probability: number }
  | { speak: true; role: string; probability: number };

const SPEAKER_LABEL: Record<Speaker, string> = {
  user: "Usuario",
  counterpart: "Contraparte",
  mixed: "Sin separar",
};

export function renderWindow(segments: WindowSegment[]): string {
  return segments.map((s) => `[${SPEAKER_LABEL[s.speaker]}] ${s.text}`).join("\n");
}

/**
 * Ventana para la Compuerta: lo de antes como contexto y, aparte, lo que se acaba de decir (el último
 * Turno: los Segmentos seguidos del último que habló). Así un precio de hace un minuto no hace hablar al
 * Rol en cada Turno que sigue (prueba del 2026-10-07: la Compuerta dijo «habla» en los 86 Turnos).
 */
export function renderGateState(segments: WindowSegment[]): string {
  if (segments.length === 0) return "";
  let start = segments.length - 1;
  const last = segments[start]!.speaker;
  while (start > 0 && segments[start - 1]!.speaker === last) start--;
  const before = segments.slice(0, start);
  const now = segments.slice(start);
  return [
    before.length ? `Antes:\n${renderWindow(before)}` : "",
    `Lo que se acaba de decir:\n${renderWindow(now)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildGateQuestion(roles: GateRole[]): ChoiceQuestion {
  const criteria: Record<string, string> = {
    [NONE_OPTION]: "Ningún asesor debe intervenir ahora.",
  };
  for (const role of roles) {
    if (role.gate_option === NONE_OPTION) throw new Error(`gate_option "${NONE_OPTION}" is reserved`);
    if (criteria[role.gate_option]) throw new Error(`duplicate gate_option "${role.gate_option}"`);
    criteria[role.gate_option] = role.gate_definition;
  }
  return {
    type: "choice",
    instructions:
      "Transcripción reciente de una reunión. ¿Qué asesor debería intervenir ahora con una sugerencia corta para el Usuario? Decide por lo que se acaba de decir: si no trae nada nuevo para ningún asesor (aunque antes se haya hablado de plata o de acuerdos), ninguno interviene.",
    criteria,
  };
}

/** Evalúa la Compuerta y traduce gate_option → id del Rol. Nada fuera de aquí ve gate_option. */
export async function evaluateGate(
  segments: WindowSegment[],
  roles: GateRole[],
  evaluate: ChoiceEvaluator,
): Promise<GateDecision> {
  if (segments.length === 0 || roles.length === 0) return { speak: false, probability: 1 };

  const answer = await evaluate(renderGateState(segments), buildGateQuestion(roles));
  const role = roles.find((r) => r.gate_option === answer.choice);
  const probability = answer.probabilities?.[answer.choice] ?? 0;

  if (!role) return { speak: false, probability };
  if (probability < role.threshold) return { speak: false, probability };
  return { speak: true, role: role.id, probability };
}

/** Ventana deslizante: Segmentos que terminan dentro de los últimos `seconds`. */
export function slideWindow(segments: WindowSegment[], seconds: number): WindowSegment[] {
  if (segments.length === 0) return segments;
  const end = segments[segments.length - 1]!.t1;
  return segments.filter((s) => s.t1 >= end - seconds);
}

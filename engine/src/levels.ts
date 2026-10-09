// Cuánto interviene cada Rol (PLAN.md, tarea 30): el Usuario elige un nivel por Rol y la Compuerta lo usa sobre
// el umbral calibrado, sin tocar el Rol (`gate_option`, `gate_definition` y `calibrated_with` siguen igual).
// La elección vive fuera del Rol, en ~/.sottoly/role-levels.json.
import type { Role } from "./roles";

export type Level = "important" | "balanced" | "often";

/** Cuánto baja cada nivel el umbral calibrado. «Solo lo importante» es el umbral tal cual. */
const OFFSET: Record<Level, number> = { important: 0, balanced: 0.1, often: 0.2 };
/** Por debajo de esto la Compuerta habla por cualquier cosa: ningún nivel baja de aquí. */
export const MIN_THRESHOLD = 0.5;

export function applyLevel(threshold: number, level: Level): number {
  return Math.max(MIN_THRESHOLD, Math.round((threshold - OFFSET[level]) * 100) / 100);
}

/** Los Roles con el umbral de su nivel; un nivel desconocido no cambia nada. */
export function withLevels(roles: Role[], levels: Record<string, string>): Role[] {
  return roles.map((r) => {
    const level = levels[r.id];
    return level && level in OFFSET ? { ...r, threshold: applyLevel(r.threshold, level as Level) } : r;
  });
}

// Eco (PLAN.md, tarea 23): sin audífonos, el micrófono capta lo que dice la Contraparte por los parlantes y la
// transcripción lo atribuye al Usuario. Una frase del Usuario es eco si casi todas sus palabras están en una
// frase reciente de la Contraparte (o al revés, si el eco llegó primero).

/** Palabras de una frase, sin mayúsculas, tildes ni puntuación. */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9ñ]+/)
    .filter(Boolean)
}

/** Las frases cortas («sí», «claro, dale») se repiten sin ser eco: no se comparan. */
const MIN_WORDS = 4
/** Qué parte de la frase del Usuario tiene que estar en la de la Contraparte. */
const SHARE = 0.8

/** ¿La frase del Usuario repite la de la Contraparte? */
export function isEcho(user: string, counterpart: string): boolean {
  const u = words(user)
  if (u.length < MIN_WORDS) return false
  const pool = new Map<string, number>()
  for (const w of words(counterpart)) pool.set(w, (pool.get(w) ?? 0) + 1)
  let shared = 0
  for (const w of u) {
    const n = pool.get(w) ?? 0
    if (n > 0) {
      shared++
      pool.set(w, n - 1)
    }
  }
  return shared / u.length >= SHARE
}

/** Cuántas frases recientes del otro lado se miran (el eco llega pegado al original). */
export const ECHO_LOOKBACK = 6

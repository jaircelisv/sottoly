// Eco (PLAN.md, tarea 23): sin audífonos, el micrófono capta lo que dice la Contraparte por los parlantes y la
// transcripción lo atribuye al Usuario. Una frase del Usuario es eco si casi todas sus palabras están en una
// frase reciente de la Contraparte (o al revés, si el eco llegó primero).

// La transcripción escribe un mismo número en palabras o en cifras según el canal («cien» y «100»): se comparan
// como cifras. Solo números sueltos: «ciento veinte» queda «100 20», y solo empareja si la otra frase lo dice igual.
const NUMBERS: Record<string, string> = Object.fromEntries(
  (
    'cero:0 uno:1 una:1 un:1 dos:2 tres:3 cuatro:4 cinco:5 seis:6 siete:7 ocho:8 nueve:9 diez:10 once:11 doce:12 ' +
    'trece:13 catorce:14 quince:15 dieciseis:16 diecisiete:17 dieciocho:18 diecinueve:19 veinte:20 treinta:30 ' +
    'cuarenta:40 cincuenta:50 sesenta:60 setenta:70 ochenta:80 noventa:90 cien:100 ciento:100 doscientos:200 ' +
    'doscientas:200 trescientos:300 trescientas:300 cuatrocientos:400 cuatrocientas:400 quinientos:500 quinientas:500 ' +
    'seiscientos:600 seiscientas:600 setecientos:700 setecientas:700 ochocientos:800 ochocientas:800 ' +
    'novecientos:900 novecientas:900 mil:1000'
  )
    .split(' ')
    .map((pair) => pair.split(':')),
)

/** Palabras de una frase, sin mayúsculas, tildes ni puntuación, con los números en cifras («1.650» = «1650»). */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/(\d)[.,](?=\d{3}\b)/g, '$1')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => NUMBERS[w] ?? w)
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

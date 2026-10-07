// Fin del habla → tarjeta, a partir del log de la App (PLAN.md, tarea 10).
//   node scripts/sottoly/latency/tarjeta.mjs < app.log
// Fin del habla de un Segmento = la hora en que se entregó (at_ms) menos su latencia. De cada tarjeta
// (SOTTOLY_SUGGESTION_FIRST: aparece el primer texto) se mide desde el fin del habla del último Segmento
// entregado antes. Percentiles por rango más cercano, como measure.sh para los Segmentos.

const SEGMENTO = /SOTTOLY_LATENCY .*latency_ms=(\d+) at_ms=(\d+)/;
const TARJETA = /SOTTOLY_SUGGESTION_FIRST at_ms=(\d+)/;

function percentil(ordenados, p) {
  return ordenados[Math.floor(p * (ordenados.length - 1) + 0.5)];
}

/** @returns {{ tarjetas: number, p50_ms: number | null, p90_ms: number | null }} */
export function fin_del_habla_a_tarjeta(log) {
  const segmentos = []; // { entregado, fin }
  const latencias = [];
  for (const linea of log.split("\n")) {
    const s = linea.match(SEGMENTO);
    if (s) {
      const entregado = Number(s[2]);
      segmentos.push({ entregado, fin: entregado - Number(s[1]) });
      continue;
    }
    const t = linea.match(TARJETA);
    if (!t) continue;
    const aparece = Number(t[1]);
    const previos = segmentos.filter((g) => g.entregado <= aparece);
    if (previos.length === 0) continue;
    const fin = Math.max(...previos.map((g) => g.fin));
    latencias.push(aparece - fin);
  }
  if (latencias.length === 0) return { tarjetas: 0, p50_ms: null, p90_ms: null };
  const ordenados = latencias.sort((a, b) => a - b);
  return { tarjetas: ordenados.length, p50_ms: percentil(ordenados, 0.5), p90_ms: percentil(ordenados, 0.9) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let log = "";
  for await (const trozo of process.stdin) log += trozo;
  const r = fin_del_habla_a_tarjeta(log);
  console.log(r.tarjetas ? `fin del habla → tarjeta: n=${r.tarjetas} p50=${r.p50_ms} p90=${r.p90_ms}` : "fin del habla → tarjeta: sin tarjetas");
}

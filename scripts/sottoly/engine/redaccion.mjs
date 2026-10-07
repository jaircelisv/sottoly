// Redacción → overlay para el gate (PLAN.md, tarea 7). Corre engine/probes/redaccion.ts con Bun:
// la cadena real (proveedor de Anthropic con la API simulada → Motor) con lo que escribe el modelo.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ENGINE = fileURLToPath(new URL("../../../engine/", import.meta.url));

function sonda(escenario) {
  const r = spawnSync("bun", ["probes/redaccion.ts"], { cwd: ENGINE, input: JSON.stringify(escenario), encoding: "utf8" });
  if (r.status !== 0) throw new Error(`la sonda falló: ${r.stderr.slice(-2000)}`);
  return JSON.parse(r.stdout.trim().split("\n").at(-1));
}

/** Lo que vería el overlay si el modelo escribe `modelo` (el JSON de la Redacción), en trozos de `trozo` caracteres. */
export function redactar({ modelo, trozo = 6 }) {
  const r = sonda({ modelo, trozo });
  return { sugerencias: r.sugerencias, tarjeta_quitada: r.tarjeta_quitada, fallo_del_proveedor: r.fallo_del_proveedor };
}

/** ¿El esquema que se le pide al modelo le deja una salida explícita para no sugerir nada? */
export function esquema_de_la_redaccion() {
  const { esquema } = sonda({ modelo: '{"text":"Pregunta si el precio incluye IVA.","reason":"Precio sin impuestos."}' });
  const props = esquema && typeof esquema === "object" ? Object.values(esquema.properties ?? {}) : [];
  return { permite_declinar: props.some((p) => p?.type === "boolean") };
}

/** Varios Turnos seguidos del mismo Rol, cada uno con la redacción que escribe el modelo (tarea 8). */
export function antiruido({ redacciones }) {
  const r = spawnSync("bun", ["probes/antiruido.ts"], { cwd: ENGINE, input: JSON.stringify({ redacciones }), encoding: "utf8" });
  if (r.status !== 0) throw new Error(`la sonda falló: ${r.stderr.slice(-2000)}`);
  const { sugerencias, la_redaccion_ve_las_anteriores } = JSON.parse(r.stdout.trim().split("\n").at(-1));
  return { sugerencias, la_redaccion_ve_las_anteriores };
}

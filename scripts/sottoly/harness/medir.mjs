// Prueba de la medición fin del habla → tarjeta para el gate (tarea 10 de PLAN.md).
//   medir_tarjeta(lineas)    → lo que calcula scripts/sottoly/latency/tarjeta.mjs con esas líneas de log
//   measure_imprime(lineas)  → corre `make measure` de verdad (sin sonido: say, afplay, swiftc y sleep
//                              son de mentira; afplay escribe las líneas en el log como lo haría la App)
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));
const MODULO = join(RAIZ, "scripts/sottoly/latency/tarjeta.mjs");

export async function medir_tarjeta(lineas) {
  if (!existsSync(MODULO)) return { tarjetas: 0, p50_ms: null, p90_ms: null, existe: false };
  const { fin_del_habla_a_tarjeta } = await import(pathToFileURL(MODULO).href);
  return { ...fin_del_habla_a_tarjeta(lineas.join("\n")), existe: true };
}

export function measure_imprime(lineas) {
  const base = mkdtempSync(join(tmpdir(), "sottoly-medir-"));
  try {
    const bin = join(base, "bin");
    mkdirSync(bin, { recursive: true });
    mkdirSync(join(base, "home"), { recursive: true });
    const log = join(base, "app.log");
    const nuevas = join(base, "nuevas.log");
    writeFileSync(log, "línea anterior a la medición\n");
    writeFileSync(nuevas, lineas.join("\n") + "\n");
    const stubs = {
      say: 'while [ $# -gt 0 ]; do [ "$1" = -o ] && { shift; : > "$1"; }; shift; done',
      // La primera frase "suena": la App escribe en el log lo que pasó.
      afplay: `[ -f "${nuevas}" ] && { cat "${nuevas}" >> "${log}"; rm -f "${nuevas}"; }; :`,
      sleep: ":",
      swiftc: 'while [ $# -gt 0 ]; do [ "$1" = -o ] && { shift; printf "#!/bin/sh\\n" > "$1"; chmod +x "$1"; }; shift; done',
    };
    for (const [nombre, cuerpo] of Object.entries(stubs)) {
      writeFileSync(join(bin, nombre), `#!/bin/sh\n${cuerpo}\n`);
      chmodSync(join(bin, nombre), 0o755);
    }
    const r = spawnSync("bash", ["-c", `make --no-print-directory measure LOG="${log}"`], {
      cwd: RAIZ,
      env: { ...process.env, HOME: join(base, "home"), TMPDIR: join(base, "tmp"), PATH: `${bin}:${process.env.PATH}` },
      encoding: "utf8",
    });
    const salida = `${r.stdout}${r.stderr}`;
    const m = salida.match(/fin del habla → tarjeta: n=(\d+) p50=(\d+) p90=(\d+)/);
    return m ? { imprime: true, tarjetas: Number(m[1]), p50_ms: Number(m[2]), p90_ms: Number(m[3]) } : { imprime: false, tarjetas: 0, p50_ms: null, p90_ms: null };
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

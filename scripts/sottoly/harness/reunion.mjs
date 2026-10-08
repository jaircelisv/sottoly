// Reuniones guardadas para el gate (tarea 15 de PLAN.md): guarda una Reunión con el repositorio real de
// Meetily (frontend/src-tauri/examples/save_meeting.rs, base SQLite temporal) y devuelve cómo vuelve.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const TAURI = join(fileURLToPath(new URL("../../../", import.meta.url)), "frontend", "src-tauri");

export function guardar_y_leer(frases) {
  const segments = frases.map((f, i) => ({ id: String(i + 1), text: f.text, timestamp: "00:00:00", ...(f.speaker ? { speaker: f.speaker } : {}) }));
  const r = spawnSync("cargo", ["run", "-q", "--example", "save_meeting"], {
    cwd: TAURI,
    input: JSON.stringify({ title: "Reunión de prueba", segments }),
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(`no se pudo guardar: ${r.stderr.slice(-1500)}`);
  return JSON.parse(r.stdout.trim().split("\n").at(-1));
}

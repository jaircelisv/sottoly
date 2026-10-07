// Prueba de `make limpiar` y del registro de `make measure` para el gate (tarea 6 de PLAN.md).
// Corre el Makefile REAL contra una base de Meetily y una carpeta de grabaciones de mentira,
// con su propio HOME, para no tocar los datos de verdad, y devuelve lo que pasó.
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));

function sh(cmd, env = {}) {
  const r = spawnSync("bash", ["-c", cmd], { cwd: RAIZ, env: { ...process.env, ...env }, encoding: "utf8" });
  return { codigo: r.status, salida: `${r.stdout}${r.stderr}` };
}

function sql(db, consulta) {
  const r = spawnSync("sqlite3", [db, consulta], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`sqlite3: ${r.stderr}`);
  return r.stdout.trim();
}

const hace = (minutos) => new Date(Date.now() - minutos * 60_000);
// Mismos formatos que escriben Meetily (sqlx/chrono, RFC 3339 con microsegundos) y `date -u`.
const rfc3339 = (d) => d.toISOString().replace(/\.(\d{3})Z$/, ".$1123+00:00");
const marcaUtc = (d) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

function carpetaDeReunion(ruta, creada) {
  mkdirSync(ruta, { recursive: true });
  writeFileSync(join(ruta, "transcripts.json"), '{"segments":[{"text":"hola"}]}');
  writeFileSync(
    join(ruta, "metadata.json"),
    JSON.stringify({ version: "1.0", created_at: rfc3339(creada), transcript_file: "transcripts.json" }, null, 2),
  );
}

/** Registra la medición con `make measure`, sin sonido: say, afplay, swiftc y sleep son de mentira. */
function probarRegistro(base) {
  const home = join(base, "home");
  const bin = join(base, "bin");
  mkdirSync(home, { recursive: true });
  mkdirSync(bin, { recursive: true });
  const stubs = {
    say: 'while [ $# -gt 0 ]; do [ "$1" = -o ] && { shift; : > "$1"; }; shift; done',
    afplay: ":",
    sleep: ":",
    swiftc: 'while [ $# -gt 0 ]; do [ "$1" = -o ] && { shift; printf "#!/bin/sh\\n" > "$1"; chmod +x "$1"; }; shift; done',
  };
  for (const [nombre, cuerpo] of Object.entries(stubs)) {
    writeFileSync(join(bin, nombre), `#!/bin/sh\n${cuerpo}\n`);
    chmodSync(join(bin, nombre), 0o755);
  }
  const log = join(base, "app.log");
  writeFileSync(log, "");
  sh(`make --no-print-directory measure LOG="${log}"`, {
    HOME: home,
    TMPDIR: join(base, "tmp"),
    PATH: `${bin}:${process.env.PATH}`,
  });
  return { medicion_registrada: existsSync(join(home, ".sottoly", "medicion-desde")) };
}

/**
 * @param {{ con_medicion?: boolean, huerfana?: boolean, carpeta_fuera?: boolean, registra_measure?: boolean }} escenario
 */
export function probar_limpiar(escenario = {}) {
  const { con_medicion = true, huerfana = false, carpeta_fuera = false, registra_measure = false } = escenario;
  const base = mkdtempSync(join(tmpdir(), "sottoly-limpiar-"));
  try {
    if (registra_measure) return probarRegistro(base);

    const home = join(base, "home");
    const datos = join(base, "datos");
    const grabaciones = join(base, "grabaciones");
    const fuera = join(base, "fuera", "Meeting fuera");
    mkdirSync(join(datos, "models"), { recursive: true });
    mkdirSync(grabaciones, { recursive: true });
    mkdirSync(home, { recursive: true });

    // Lo que no es de ninguna Reunión de prueba.
    writeFileSync(join(datos, "preferences.json"), "{}");
    writeFileSync(join(datos, "models", "modelo.bin"), "pesos");
    writeFileSync(join(grabaciones, "notas.txt"), "no es una Reunión");

    const db = join(datos, "meeting_minutes.sqlite");
    sql(
      db,
      `CREATE TABLE meetings (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, folder_path TEXT);
       CREATE TABLE transcripts (id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL, transcript TEXT NOT NULL, timestamp TEXT NOT NULL,
         FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE);
       CREATE TABLE settings (id TEXT PRIMARY KEY, provider TEXT);
       INSERT INTO settings VALUES ('1', 'ollama');`,
    );
    const reunion = (id, creada, carpeta) => {
      if (carpeta) carpetaDeReunion(carpeta, creada);
      sql(
        db,
        `INSERT INTO meetings VALUES ('${id}', 'Meeting ${id}', '${rfc3339(creada)}', '${rfc3339(creada)}', ${carpeta ? `'${carpeta}'` : "NULL"});
         INSERT INTO transcripts VALUES ('${id}-t1', '${id}', 'hola', '${rfc3339(creada)}'), ('${id}-t2', '${id}', 'adiós', '${rfc3339(creada)}');`,
      );
    };

    const anterior = join(grabaciones, "Meeting anterior");
    const prueba = join(grabaciones, "Meeting prueba");
    const sinFila = join(grabaciones, "Meeting sin fila");
    reunion("anterior", hace(120), anterior);
    reunion("prueba", hace(10), prueba);
    if (huerfana) carpetaDeReunion(sinFila, hace(5));
    if (carpeta_fuera) reunion("fuera", hace(8), fuera);

    const medicion = join(home, ".sottoly", "medicion-desde");
    if (con_medicion) {
      mkdirSync(join(home, ".sottoly"), { recursive: true });
      writeFileSync(medicion, `${marcaUtc(hace(30))}\n`);
    }

    const r = sh(`make --no-print-directory limpiar MEETILY_DATA="${datos}" RECORDINGS="${grabaciones}"`, { HOME: home });

    const filas = (tabla, id) => Number(sql(db, `SELECT count(*) FROM ${tabla} WHERE ${tabla === "meetings" ? "id" : "meeting_id"}='${id}'`));
    const reunionIntacta = (id, carpeta) =>
      filas("meetings", id) === 1 && filas("transcripts", id) === 2 && existsSync(join(carpeta, "transcripts.json"));
    const reunionBorrada = (id, carpeta) =>
      filas("meetings", id) === 0 && filas("transcripts", id) === 0 && (carpeta === null || !existsSync(carpeta));

    if (r.codigo !== 0) {
      return {
        ok: false,
        nada_borrado: reunionIntacta("anterior", anterior) && reunionIntacta("prueba", prueba),
        menciona_medicion: /medici[oó]n/i.test(r.salida),
      };
    }

    return {
      ok: true,
      borradas_las_de_prueba:
        reunionBorrada("prueba", prueba) &&
        (!huerfana || !existsSync(sinFila)) &&
        (!carpeta_fuera || reunionBorrada("fuera", null)),
      quedan_las_anteriores: reunionIntacta("anterior", anterior) && existsSync(join(anterior, "metadata.json")),
      resto_intacto:
        sql(db, "SELECT provider FROM settings WHERE id='1'") === "ollama" &&
        existsSync(join(datos, "preferences.json")) &&
        existsSync(join(datos, "models", "modelo.bin")) &&
        existsSync(join(grabaciones, "notas.txt")) &&
        (!carpeta_fuera || existsSync(join(fuera, "transcripts.json"))),
      medicion_olvidada: !existsSync(medicion),
    };
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

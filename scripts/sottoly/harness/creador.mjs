// Creador de Roles para el gate (tarea 14 de PLAN.md): crea un Rol con el comando de Rust
// (frontend/src-tauri/examples/create_role.rs, la misma función que usa la App) en una carpeta de Roles
// temporal con los Roles del repo, y comprueba que el Motor lo carga con su propia validación.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));
const TAURI = join(RAIZ, "frontend", "src-tauri");
const ENGINE = join(RAIZ, "engine");

export function crear_rol(borrador) {
  const roles = mkdtempSync(join(tmpdir(), "sottoly-roles-"));
  try {
    cpSync(join(RAIZ, "roles"), roles, { recursive: true });
    const r = spawnSync("cargo", ["run", "-q", "--example", "create_role"], {
      cwd: TAURI,
      input: JSON.stringify(borrador),
      env: { ...process.env, SOTTOLY_ROLES_DIR: roles },
      encoding: "utf8",
    });
    let salida = { ok: false, error: r.stderr.slice(-500) };
    try {
      salida = JSON.parse(r.stdout.trim().split("\n").at(-1));
    } catch {}
    const motivo = salida.ok ? null : /ya existe/i.test(salida.error ?? "") ? "ya_existe" : /cuándo interviene/i.test(salida.error ?? "") ? "falta_cuando" : "otro";

    let enMotor = null;
    if (salida.ok) {
      const m = spawnSync(
        "bun",
        ["-e", `import { loadRoles, selectBoard } from "./src/roles"; const all = loadRoles(${JSON.stringify(roles)}); const r = all.find((x) => x.id === ${JSON.stringify(salida.id)}); console.log(JSON.stringify({ r, junta: selectBoard(all, undefined).some((x) => x.id === ${JSON.stringify(salida.id)}) }));`],
        { cwd: ENGINE, encoding: "utf8" },
      );
      if (m.status === 0) enMotor = JSON.parse(m.stdout.trim().split("\n").at(-1));
    }
    const rol = enMotor?.r;
    return {
      creado: Boolean(salida.ok),
      carga_en_el_motor: Boolean(rol),
      sin_calibrar: rol ? rol.calibrated_with === "none" : false,
      umbral_conservador: rol ? rol.threshold >= 0.85 : false,
      con_ejemplos: salida.ok ? existsSync(join(roles, `${salida.id}.examples.json`)) : false,
      en_la_junta: Boolean(enMotor?.junta),
      roles_del_repo_intactos: readdirSync(roles).filter((f) => f.endsWith(".md")).length === readdirSync(join(RAIZ, "roles")).filter((f) => f.endsWith(".md")).length + (salida.ok ? 1 : 0),
      motivo,
    };
  } finally {
    rmSync(roles, { recursive: true, force: true });
  }
}

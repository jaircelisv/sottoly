// Prueba de `make worktree` para el gate (tarea 2 de PLAN.md).
// Corre el Makefile REAL de la raíz dentro de un repo temporal con su propio `origin`
// y su propio HOME, para no tocar el repo ni el ~ de verdad, y devuelve lo que pasó.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));
const LINEA_PRIVADA = "@~/.sottoly/CLAUDE.private.md";

function sh(cmd, cwd, env = {}) {
  const r = spawnSync("bash", ["-c", cmd], { cwd, env: { ...process.env, ...env }, encoding: "utf8" });
  return { codigo: r.status, salida: `${r.stdout}${r.stderr}` };
}

/**
 * @param {{ nombre?: string, con_archivo_privado?: boolean, con_binarios?: boolean }} escenario
 */
export function probar_worktree(escenario = {}) {
  const { nombre = "prueba", con_archivo_privado = true, con_binarios = true } = escenario;
  const base = mkdtempSync(join(tmpdir(), "sottoly-worktree-"));
  try {
    const home = join(base, "home");
    const origen = join(base, "origen.git");
    const repo = join(base, "repo");
    const destino = join(base, "worktrees");
    mkdirSync(home, { recursive: true });

    // origin con un main que trae el Makefile y el .gitignore reales.
    sh(`git init -q --bare -b main "${origen}"`, base);
    sh(`git clone -q "${origen}" repo 2>/dev/null`, base);
    copyFileSync(join(RAIZ, "Makefile"), join(repo, "Makefile"));
    copyFileSync(join(RAIZ, ".gitignore"), join(repo, ".gitignore"));
    sh(`git checkout -q -b main && git add -A && git -c user.email=t@t -c user.name=t commit -qm base && git push -q origin main`, repo);
    const commitMain = sh("git rev-parse origin/main", repo).salida.trim();

    if (con_archivo_privado) {
      mkdirSync(join(home, ".sottoly"), { recursive: true });
      writeFileSync(join(home, ".sottoly", "CLAUDE.private.md"), "# contexto privado de prueba\n");
    }
    if (con_binarios) {
      const bin = join(repo, "frontend", "src-tauri", "binaries");
      mkdirSync(bin, { recursive: true });
      writeFileSync(join(bin, "llama-helper-prueba"), "bin");
      writeFileSync(join(bin, "sottoly-engine-prueba"), "bin");
    }

    const nombreArg = nombre ? `NAME=${nombre}` : "";
    const r = sh(`make --no-print-directory worktree ${nombreArg} WORKTREES_DIR="${destino}"`, repo, { HOME: home });

    const ruta = join(destino, nombre || "_");
    const ok = r.codigo === 0 && existsSync(join(ruta, ".git"));
    if (!ok) {
      return {
        ok: false,
        menciona_archivo_privado: r.salida.includes(".sottoly/CLAUDE.private.md"),
        menciona_name: /NAME/.test(r.salida),
      };
    }

    const local = join(ruta, "CLAUDE.local.md");
    const binarios = join(ruta, "frontend", "src-tauri", "binaries");
    return {
      ok: true,
      rama: sh("git branch --show-current", ruta).salida.trim(),
      desde_origin_main: sh("git rev-parse HEAD", ruta).salida.trim() === commitMain,
      claude_local: existsSync(local) ? readFileSync(local, "utf8").trim() === LINEA_PRIVADA : false,
      claude_local_ignorado: sh("git status --porcelain --ignored CLAUDE.local.md", ruta).salida.startsWith("!!"),
      binarios_copiados:
        existsSync(join(binarios, "llama-helper-prueba")) && existsSync(join(binarios, "sottoly-engine-prueba")),
    };
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

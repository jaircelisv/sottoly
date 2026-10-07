// Pruebas de los hooks del harness (.claude/hooks/). Se ejecutan como los ejecuta Claude Code:
// el JSON de la llamada por stdin y CLAUDE_PROJECT_DIR en el entorno. Salida 2 = bloqueado.
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOOKS = join(import.meta.dir, "../../../.claude/hooks");

function correr(hook: string, entrada: unknown, proyecto = tmpdir()) {
  const r = Bun.spawnSync(["bash", join(HOOKS, hook)], {
    stdin: Buffer.from(JSON.stringify(entrada)),
    env: { ...process.env, CLAUDE_PROJECT_DIR: proyecto },
  });
  return { codigo: r.exitCode, error: r.stderr.toString() };
}

// Valores con forma de key, armados por partes para que ni este archivo los contenga enteros.
const KEY_ANTHROPIC = ["sk", "ant", "api03", "x".repeat(40)].join("-");
const KEY_PADDLE = "pdl" + "_live_apikey_" + "0".repeat(30);

describe("secretos.sh", () => {
  test("bloquea escribir un archivo con una key de Anthropic", () => {
    const r = correr("secretos.sh", {
      tool_name: "Write",
      tool_input: { file_path: "/repo/engine/src/config.ts", content: `const k = "${KEY_ANTHROPIC}";` },
    });
    expect(r.codigo).toBe(2);
    expect(r.error).toContain("key");
  });

  test("bloquea un Edit que pega una key de Paddle", () => {
    const r = correr("secretos.sh", {
      tool_name: "Edit",
      tool_input: { file_path: "/repo/README.md", old_string: "x", new_string: `PADDLE=${KEY_PADDLE}` },
    });
    expect(r.codigo).toBe(2);
  });

  test("deja pasar contenido normal", () => {
    const r = correr("secretos.sh", {
      tool_name: "Write",
      tool_input: { file_path: "/repo/engine/src/x.ts", content: 'const modelo = "claude-haiku-4-5-20251001";' },
    });
    expect(r.codigo).toBe(0);
  });

  test("deja pasar el nombre de la variable sin valor", () => {
    const r = correr("secretos.sh", {
      tool_name: "Write",
      tool_input: { file_path: "/repo/docs/x.md", content: "Lee ANTHROPIC_API_KEY del Keychain." },
    });
    expect(r.codigo).toBe(0);
  });

  test("en un .env sí se permite (está en .gitignore)", () => {
    const r = correr("secretos.sh", {
      tool_name: "Write",
      tool_input: { file_path: "/repo/frontend/.env", content: `KEY=${KEY_ANTHROPIC}` },
    });
    expect(r.codigo).toBe(0);
  });
});

describe("comandos.sh", () => {
  const bash = (command: string) => correr("comandos.sh", { tool_name: "Bash", tool_input: { command } });

  test("permite git push --force-with-lease (rebasar una rama de PR)", () => {
    expect(bash("git push --force-with-lease origin sottoly/x").codigo).toBe(0);
  });

  test("sigue bloqueando git push --force", () => {
    expect(bash("git push --force origin sottoly/x").codigo).toBe(2);
  });

  test("sigue bloqueando git push -f", () => {
    expect(bash("git push -f origin sottoly/x").codigo).toBe(2);
  });
});

describe("medir.sh", () => {
  function proyecto() {
    const dir = mkdtempSync(join(tmpdir(), "sottoly-medir-"));
    mkdirSync(join(dir, "engine/src"), { recursive: true });
    mkdirSync(join(dir, ".harness"), { recursive: true });
    return dir;
  }
  const parar = (dir: string, activo = false) => correr("medir.sh", { stop_hook_active: activo }, dir);

  test("avisa si cambiaste código del Motor después de la última medición", () => {
    const dir = proyecto();
    const marca = join(dir, ".harness/ultima-medicion");
    writeFileSync(marca, "0");
    utimesSync(marca, new Date(1_000_000_000_000), new Date(1_000_000_000_000));
    writeFileSync(join(dir, "engine/src/engine.ts"), "// cambio");
    const r = parar(dir);
    expect(r.codigo).toBe(2);
    expect(r.error).toContain("engine/src/engine.ts");
  });

  test("avisa si hay código y el gate nunca corrió", () => {
    const dir = proyecto();
    writeFileSync(join(dir, "engine/src/engine.ts"), "// código");
    expect(parar(dir).codigo).toBe(2);
  });

  test("no avisa si se midió después del último cambio", () => {
    const dir = proyecto();
    const archivo = join(dir, "engine/src/engine.ts");
    writeFileSync(archivo, "// código");
    utimesSync(archivo, new Date(1_000_000_000_000), new Date(1_000_000_000_000));
    writeFileSync(join(dir, ".harness/ultima-medicion"), "1");
    expect(parar(dir).codigo).toBe(0);
  });

  test("avisa una sola vez por turno", () => {
    const dir = proyecto();
    writeFileSync(join(dir, "engine/src/engine.ts"), "// código");
    expect(parar(dir, true).codigo).toBe(0);
  });
});

#!/usr/bin/env bash
# Impide escribir algo con forma de llave en un archivo del repositorio.
#
# ⚠ Por qué la regla escrita no basta: el agente la lee, la entiende, y luego
# pega la llave «solo para probar». Es el modo de fallo documentado del software
# construido por gente que no es técnica —llaves en el bundle, credenciales en
# el repositorio— y el daño no se ve hasta que alguien vacía una cuenta.
#
# SOTTOLY: la versión descargada leía la ruta y salía con 0 siempre; no revisaba
# nada. Ahora mira el contenido que se va a escribir (Write: content; Edit:
# new_string; MultiEdit: cada new_string) contra las formas de las keys que usa
# el proyecto. El repo es público: el pre-commit (gitleaks) es la segunda red.
#
# ⚠ Lo que NO ve: una key escrita desde Bash (`echo > archivo`). Es la barandilla
# de las herramientas de edición, no un aislamiento.
set -uo pipefail

if ! command -v node >/dev/null 2>&1; then
  echo "Bloqueado: el guardián de secretos necesita node para decidir y no lo encuentra." >&2
  exit 2
fi

read -r -d '' DECIDIR <<'JS'
let d = '';
process.stdin.on('data', (c) => (d += c)).on('end', () => {
  let j = {};
  try { j = JSON.parse(d); } catch { process.exit(0); }
  const entrada = j?.tool_input ?? {};
  const ruta = String(entrada.file_path ?? entrada.notebook_path ?? '');

  // En .env sí van, y .env está en .gitignore. En .env.example va el NOMBRE de la
  // variable y nunca su valor.
  if (/(^|\/)\.env$/.test(ruta)) process.exit(0);

  const textos = [entrada.content, entrada.new_string, entrada.new_source];
  if (Array.isArray(entrada.edits)) for (const e of entrada.edits) textos.push(e?.new_string);
  const texto = textos.filter((t) => typeof t === 'string').join('\n');
  if (!texto) process.exit(0);

  // Formas de las keys del proyecto (los NOMBRES de variable no hacen match).
  const FORMAS = [
    ['Anthropic', /sk-ant-[A-Za-z0-9_-]{20,}/],
    ['Paddle', /pdl_(live|sdbx)_[A-Za-z0-9_]{20,}/],
    ['Resend', /\bre_[A-Za-z0-9]{6,}_[A-Za-z0-9]{12,}/],
    ['Supabase (secret)', /sb_secret_[A-Za-z0-9_-]{16,}/],
    ['GitHub', /\b(ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/],
    ['AWS', /\bAKIA[0-9A-Z]{16}\b/],
    ['clave privada', /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/],
  ];
  for (const [nombre, forma] of FORMAS) {
    if (forma.test(texto)) {
      process.stderr.write(
        `Bloqueado: el texto que vas a escribir en '${ruta || 'un archivo'}' tiene forma de key de ${nombre}. ` +
          'Las keys viven en el Keychain (servicio = nombre de la variable) o en un .env ignorado; ' +
          'en el repo solo va el NOMBRE de la variable. Si es un ejemplo, ármalo por partes o usa un valor falso evidente.\n',
      );
      process.exit(2);
    }
  }
  process.exit(0);
});
JS

node -e "$DECIDIR"
codigo=$?

# Cualquier salida que no sea 0 ni 2 Claude Code la toma por un error que NO
# bloquea: un node que revienta dejaría pasar la escritura. Se cierra aquí.
if [ "$codigo" -ne 0 ] && [ "$codigo" -ne 2 ]; then
  echo "Bloqueado: el guardián de secretos no pudo decidir (salida $codigo)." >&2
  exit 2
fi
exit "$codigo"

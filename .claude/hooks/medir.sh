#!/usr/bin/env bash
# No te dejo terminar diciendo que algo funciona si no lo has medido después de
# cambiarlo.
#
# ── ⚠⚠ Por qué este hook existe ─────────────────────────────────────────────
#
# Porque `CLAUDE.md` llevaba escrito que existía y NO EXISTÍA. Prometía hooks
# que «avisan cuando declaras que algo funciona sin haber corrido el gate», y
# los que había solo cubrían borrados y escrituras fuera de `src/`. Una promesa
# sin nada detrás es peor que no prometer nada: se lee con confianza.
#
# ── Lo que compara, y por qué así ───────────────────────────────────────────
#
# No lee lo que escribiste ni busca la palabra «funciona». Eso sería adivinar.
# Compara dos fechas: la del archivo más nuevo de `src/` y la de la última vez
# que corrió el gate. Si cambiaste código después de medir, **no sabes en qué
# estado está** — lo digas o no.
#
# «¿Has medido después de cambiar?» es un hecho. «¿Estás afirmando algo?» es una
# opinión, y una opinión no puede ser una barandilla.
#
# ── ⚠ Avisa UNA vez por turno, no atrapa ────────────────────────────────────
#
# Claude Code manda `stop_hook_active: true` cuando ya bloqueó una vez, y aquí
# se respeta: el segundo intento pasa. Sin eso, un agente que legítimamente
# quiere parar a preguntarte algo se quedaría dando vueltas para siempre, que es
# mucho peor que no avisar.
set -uo pipefail

entrada="$(cat)"

# ¿Ya avisamos en este turno? Entonces se sale sin molestar más.
repetido=$(printf '%s' "$entrada" | node -e "
  let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
    try{process.stdout.write(JSON.parse(d).stop_hook_active?'si':'')}catch{}
  })")
[ -n "$repetido" ] && exit 0

raiz="${CLAUDE_PROJECT_DIR:-.}"

# Todavía no hay producto: no hay nada que medir y no hay nada que afirmar.
[ -d "$raiz/src" ] || exit 0

marca="$raiz/.harness/ultima-medicion"

if [ ! -f "$marca" ]; then
  echo "Hay código en src/ y el gate no se ha corrido ni una vez en esta sesión. Corre \`node gate/verificar.mjs\` y enseña la salida antes de dar nada por terminado: sin medir, ni tú ni la persona sabéis en qué estado está." >&2
  exit 2
fi

# ⚠ `-newer` compara la fecha de modificación contra la del archivo de marca.
# `-quit` para en el primero: basta con que UNO sea más nuevo.
cambiado=$(find "$raiz/src" -type f -not -path '*/node_modules/*' -newer "$marca" -print -quit 2>/dev/null)

if [ -n "$cambiado" ]; then
  echo "Cambiaste código después de la última medición (por ejemplo ${cambiado#"$raiz"/}). Corre \`node gate/verificar.mjs\` otra vez y enseña la salida: lo que sabías del estado anterior ya no vale para este." >&2
  exit 2
fi

exit 0

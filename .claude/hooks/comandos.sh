#!/usr/bin/env bash
# Rechaza los comandos que no tienen vuelta atrás.
#
# ⚠⚠ POR QUÉ ES UN HOOK Y NO UNA LISTA "deny" NI UNA REGLA ESCRITA:
# un hook PreToolUse corre ANTES de comprobar el modo de permisos, en todos los
# modos — incluido --dangerously-skip-permissions. Es lo único de este harness
# que no se desactiva cambiando de modo. Todo lo demás es una convención que se
# cumple porque está escrita.
#
# ⚠⚠ Y LO QUE NO PUEDE HACER, dicho aquí para que nadie lo tome por una
# garantía: mira el TEXTO del comando. Bloquea "rm -rf"; no bloquea el mismo
# borrado hecho desde un script de Python o un Makefile. Es la barandilla que
# cubre el despiste, no un aislamiento. Una barandilla presentada como garantía
# es peor que ninguna.
set -uo pipefail

cmd=$(node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{process.stdout.write(JSON.parse(d).tool_input.command||'')}catch{}})")

# ⚠ Cada motivo va escrito. Un mensaje que solo dice «bloqueado» hace que el
# agente pruebe una variante; uno que dice POR QUÉ le hace buscar otro camino.
rechazar() {
  printf '%s\n' "$1" >&2
  exit 2
}

# ⚠ Las dos ÓRDENES de las banderas. La primera versión solo miraba -rf y
# dejaba pasar -fr, que hace exactamente lo mismo. Lo encontró el test que
# ejecuta el hook, no una revisión: leyendo la expresión parecía correcta.
if echo "$cmd" | grep -Eq 'rm[[:space:]]+-[a-zA-Z]*([rR][a-zA-Z]*[fF]|[fF][a-zA-Z]*[rR])'; then
  rechazar "Bloqueado: borrado recursivo forzado. Si de verdad hay que borrar algo, pregúntaselo a la persona: no se deshace."
fi

# SOTTOLY: `--force-with-lease` sí se permite: es como se actualiza una rama de PR
# después de rebasarla, y falla si alguien más empujó a esa rama. Se quita del
# texto antes de buscar `--force` / `-f`, que siguen bloqueados.
sin_lease=$(printf '%s' "$cmd" | sed -E 's/--force-with-lease(=[^[:space:]]*)?//g; s/--force-if-includes//g')
if echo "$sin_lease" | grep -Eq 'git[[:space:]]+push.*(--force|[[:space:]]-f([[:space:]]|$))'; then
  rechazar "Bloqueado: un push forzado reescribe historia publicada y se lleva el único punto de retorno que hay. Para actualizar una rama de PR rebasada usa --force-with-lease."
fi

if echo "$cmd" | grep -Eq 'git[[:space:]]+(reset[[:space:]]+--hard|clean[[:space:]]+-[a-zA-Z]*f)'; then
  rechazar "Bloqueado: eso tira trabajo sin commitear y no hay reflog que lo recupere. Haz un commit antes, aunque sea a medias."
fi

if echo "$cmd" | grep -Eiq '(drop[[:space:]]+(table|database|schema)|truncate[[:space:]]+table)'; then
  rechazar "Bloqueado: eso borra datos. Los cambios de esquema van en una migración que solo añade."
fi

# ⚠⚠ Bajar el trinquete del gate es de la PERSONA (CAS-466). `--aceptar-menos`
# dice «acepto que el gate mida menos que la última vez que pasó», y un agente
# atascado es justo quien querría decirlo. Sin esta línea, `Bash(node *)` de
# `settings.json` lo dejaría correr sin preguntar. Y lo mismo para tocar el
# trinquete a mano desde la terminal: `frontera.sh` solo ve Write y Edit.
if echo "$cmd" | grep -Eq -- '--aceptar-menos|\.harness/trinquete'; then
  rechazar "Bloqueado: bajar el trinquete del gate lo decide la persona, no tú. Si un caso sobra, explícale cuál y por qué, y que corra ella 'node gate/verificar.mjs --aceptar-menos' en su terminal."
fi

if echo "$cmd" | grep -Eq '(npm[[:space:]]+publish|--prod)'; then
  rechazar "Bloqueado: publicar es de la persona, no tuyo. Es la única decisión que no se deshace."
fi

exit 0

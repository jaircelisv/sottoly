#!/usr/bin/env bash
# Apunta CUÁNDO se midió por última vez.
#
# No decide nada: solo deja constancia. Quien decide es `medir.sh`, que compara
# esta marca con la fecha de tu código.
#
# ⚠ Corre DESPUÉS de cada Bash, y solo escribe si el comando era el gate. Así la
# marca dice «se midió», no «se intentó».
set -uo pipefail

cmd=$(node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{process.stdout.write(JSON.parse(d).tool_input.command||'')}catch{}})")

case "$cmd" in
  *gate/verificar.mjs*)
    raiz="${CLAUDE_PROJECT_DIR:-.}"
    mkdir -p "$raiz/.harness"
    date +%s > "$raiz/.harness/ultima-medicion"
    ;;
esac

exit 0

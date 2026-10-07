#!/bin/bash
# Borra los datos de prueba de una medición (PLAN.md, tarea 6).
#   scripts/sottoly/limpiar.sh <datos de Meetily> <carpeta de grabaciones> <registro de la medición>
# Una Reunión de prueba es la que se creó desde que `make measure` registró la medición. Se borra
# su fila (y en cascada sus transcripciones) de la base de Meetily y su carpeta, con el
# transcripts.json, solo si está dentro de la carpeta de grabaciones. Nada más se toca.
set -euo pipefail
DATA="${1:?falta la carpeta de datos de Meetily}"
RECORDINGS="${2:?falta la carpeta de grabaciones}"
MEDICION="${3:?falta el registro de la medición}"

[ -f "$MEDICION" ] || {
  echo "No hay ninguna medición registrada ($MEDICION): no se borra nada. La registra make measure." >&2
  exit 2
}
desde="$(head -n 1 "$MEDICION")"
[[ "$desde" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] || {
  echo "El registro de la medición ($MEDICION) no tiene una fecha válida: no se borra nada." >&2
  exit 2
}

DB="$DATA/meeting_minutes.sqlite"
GRABACIONES="$(cd "$RECORDINGS" 2>/dev/null && pwd -P || true)"

# ¿Es una carpeta de Reunión dentro de la carpeta de grabaciones?
dentro() {
  local real
  [ -n "$GRABACIONES" ] && real="$(cd "$1" 2>/dev/null && pwd -P)" || return 1
  [ "$(dirname "$real")" = "$GRABACIONES" ]
}

desde_la_medicion() {
  [ "$(sqlite3 :memory: "SELECT julianday('$1') >= julianday('$desde')")" = 1 ]
}

reuniones=0
carpetas=0

if [ -f "$DB" ]; then
  while IFS= read -r carpeta; do
    if [ -n "$carpeta" ] && dentro "$carpeta"; then
      rm -rf "$carpeta"
      carpetas=$((carpetas + 1))
    fi
  done < <(sqlite3 "$DB" "SELECT coalesce(folder_path, '') FROM meetings WHERE julianday(created_at) >= julianday('$desde')")
  reuniones="$(sqlite3 "$DB" "PRAGMA foreign_keys = ON; DELETE FROM meetings WHERE julianday(created_at) >= julianday('$desde'); SELECT changes();")"
fi

# Carpetas que Meetily dejó sin fila en la base (grabación cortada): se reconocen por su metadata.json.
if [ -n "$GRABACIONES" ]; then
  for meta in "$GRABACIONES"/*/metadata.json; do
    [ -f "$meta" ] || continue
    creada="$(sed -n 's/.*"created_at"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$meta" | head -n 1)"
    [[ "$creada" =~ ^[0-9T:.+\ -]+(Z)?$ ]] || continue
    if desde_la_medicion "$creada"; then
      rm -rf "$(dirname "$meta")"
      carpetas=$((carpetas + 1))
    fi
  done
fi

rm -f "$MEDICION"
echo "Medición del $desde: $reuniones Reuniones de prueba borradas de la base y $carpetas carpetas (con su transcripts.json)."

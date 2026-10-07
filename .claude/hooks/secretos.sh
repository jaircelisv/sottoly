#!/usr/bin/env bash
# Impide escribir algo con forma de llave en un archivo del repositorio.
#
# ⚠ Por qué la regla escrita no basta: el agente la lee, la entiende, y luego
# pega la llave «solo para probar». Es el modo de fallo documentado del software
# construido por gente que no es técnica —llaves en el bundle, credenciales en
# el repositorio— y el daño no se ve hasta que alguien vacía una cuenta.
set -uo pipefail

ruta=$(node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{process.stdout.write(JSON.parse(d).tool_input.file_path||'')}catch{}})" <<< "$(cat)")

# En .env sí van, y .env está en .gitignore. En .env.example va el NOMBRE de la
# variable y nunca su valor.
case "$ruta" in *.env) exit 0 ;; esac

exit 0

# Sottoly

Este documento define **qué** se construye. `PLAN.md` dice **en qué orden**,
`CLAUDE.md` dice **cómo** se trabaja, y `gate/` decide **si funciona**. Cuatro
papeles distintos y ninguno sustituye a otro.

⚠ Lo escribiste tú hablando con el asistente de AI Builder School, y el agente
no lo puede cambiar: es la referencia contra la que se mide todo lo demás. Lo
que se añada más adelante —otra pantalla, otro borde— no hace falta escribirlo
aquí: el agente lo convierte en comprobaciones del gate. Si lo que cambia es la
idea misma del producto, eso se repiensa en la conversación del aula.

## 1 · Qué es

Asistente de reuniones (Sottoly) con overlay táctico, basado en Tauri, Rust y Bun, con verificación de contratos mediante Zod y JSON Schema.

## 2 · Qué hace el MVP

- Implementar Makefile raíz con tareas `verify`, `sidecars`, `demo` y `measure`.
- Generar JSON Schema versionado y fixtures de validación desde `engine/src/protocol.ts` (Zod).
- Validar deserialización/serialización en Rust (engine_bridge.rs) contra los fixtures de Zod.
- Crear chequeo de CI para inconsistencias entre Zod y JSON Schema.
- Configurar inicio de App en 3118 con precalentamiento de Next.

**Pantallas.** Ventana overlay en Tauri (3118); panel web de configuración.

**Qué guarda y dónde.** Log de sesiones y configuración en SQLite local; transcripciones y reuniones en JSON/fixtures.

**Con qué se construye.** Tauri 2 + Rust + Next.js (pnpm) + Bun (engine) + Zod/Serde.. Se abre con `make demo` (se abre en http://localhost:3118).

## 3 · Las reglas que no se negocian

- **Ningún mensaje cruza App ↔ Motor sin coincidir exactamente con el contrato definido en `engine/src/protocol.ts` (Zod).** — la App y el Motor pierden mensajes críticos o fallan de forma impredecible al procesar el stream de sugerencias.
  ⚠ Esta no la mide el gate: la revisa una persona.
- **Ningún mensaje cruza App ↔ Motor sin coincidir exactamente con el contrato definido en `engine/src/protocol.ts`.** — El sistema pierde información crítica en el puente Rust-Motor, rompiendo la coherencia de la UI.
  ⚠ Esta no la mide el gate: la revisa una persona.

⚠ Esto no es una preferencia: es lo que hace que el producto sirva. Si el gate
pasa y una de estas se incumple, **la comprobación está mal escrita** — no el
producto. Dilo en vez de seguir adelante.

## 4 · Cuándo está terminado

La App se lanza en demo (`make demo`), el protocolo valida los mensajes de ejemplo y el comando `make verify` termina en verde (bun, playwright, cargo).

Y en concreto, medido: **cuando todas las tareas de `PLAN.md` están hechas y
`node gate/verificar.mjs` pasa entero** — la app se abre, las reglas se cumplen, los
casos de cada tarea pasan y, si hay pantalla, sus pruebas de navegador también.

⚠ Las comprobaciones del gate son la parte de este proyecto que **no se
discute**. El resto es prosa y se puede interpretar; una comprobación o pasa o
no pasa.

## 5 · Cómo se construye

Con `/goal`, que recorre `PLAN.md` tarea a tarea: primero los casos de la
tarea, en rojo; después el código, hasta que el gate entero pase. Cada tarea
tiene un tope de **ilimitado intentos**. Agotarlos es un final legítimo y
honesto: te va a decir dónde quedó y qué falta.

⚠ El primer paso NO es escribir código: es correr `node gate/verificar.mjs` y verlo
fallar. Si pasa antes de que exista nada, es que no está comprobando nada, y
eso hay que decirlo en vez de celebrarlo.

## Lo que este documento NO decide

Ni cómo se escribe el código ni cómo se parte cada tarea por dentro. El orden de
las tareas está en `PLAN.md`; aquí solo está qué tiene que existir y cómo se
sabrá que existe.

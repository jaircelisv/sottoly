# Sottoly

Este documento define **qué** se construye en esta etapa del harness. `PLAN.md` dice **en qué orden**, `CLAUDE.md` dice **cómo** se trabaja, y `gate/` decide **si funciona**. El diseño completo del producto vive en `SPEC.md` y el vocabulario en `GLOSSARY.md`.

⚠ El agente no puede cambiar este documento: es la referencia contra la que se mide todo lo demás. Lo que se añada más adelante —otra pantalla, otro borde— no hace falta escribirlo aquí: el agente lo convierte en comprobaciones del gate. Si lo que cambia es la idea misma del producto, eso lo decide Jair.

## 1 · Qué es

Sottoly es una **junta asesora de IA** para fundadores y CTOs: escucha sus Reuniones 1:1 de alto riesgo (plata, contratos, plazos) y les muestra **en vivo**, en un overlay, una Sugerencia corta de un Rol (Betty · CFO, Sheldon · CEO adversarial) sobre qué preguntar, qué revisar o qué no aceptar todavía.

- **Cadena:** audio (micrófono = Usuario, sistema = Contraparte) → Segmentos (Parakeet local) → Motor (Turnos, Compuerta con Jev, Redacción con Haiku 4.5 en streaming) → overlay.
- **Objetivo de la demo:** en una Reunión real, Betty muestra al menos una Sugerencia útil en **menos de 2 s** desde el fin del habla, en el overlay.
- **Base:** fork fiel de Meetily (Tauri 2 + Rust + Next.js), Motor en TypeScript compilado con Bun como sidecar (ADR-0001).

## 2 · Qué hace el MVP del harness

- `Makefile` en la raíz: `verify`, `sidecars`, `demo` (App en `localhost:3118`), `measure` y `worktree`.
- Worktrees que comparten el contexto privado sin versionarlo (`~/.sottoly/CLAUDE.private.md`).
- Contrato App ↔ Motor con una sola fuente (Zod en `engine/src/protocol.ts`): JSON Schema versionado y mensajes de ejemplo que aceptan igual Zod y Rust (`engine_bridge.rs`).
- Overlay que dibuja la Sugerencia en streaming (`suggestion_delta`, `suggestion`, `suggestion_cancel`).
- Limpieza de los datos de prueba que deja una medición.

**Pantallas.** La ventana principal de Meetily (Next.js en `localhost:3118` dentro de Tauri) y el overlay: segunda ventana de Tauri, flotante, con la tarjeta "Persona · Rol", el texto, el motivo y los botones Útil / No útil.

**Qué guarda y dónde.** El audio **no** se guarda por defecto. Meetily todavía guarda las transcripciones (SQLite y `transcripts.json`); apagarlas por defecto es trabajo posterior, y mientras tanto se borran después de cada medición. Las keys viven en el Keychain de macOS, nunca en el repo. El repo es público: nada de datos de Reuniones reales (van a `sottoly-evals`, privado).

**Con qué se construye.** Tauri 2 + Rust + Next.js (pnpm) + Bun (Motor y overlay) + Zod/Serde. Se abre con `make demo` (se abre en http://localhost:3118).

## 3 · Las reglas que no se negocian

- **Ningún mensaje cruza App ↔ Motor sin coincidir con el contrato definido en `engine/src/protocol.ts` (Zod).** — Si no, la App y el Motor pierden mensajes o los procesan distinto, como pasó con `role_label` y con el `id` de la Sugerencia. **La mide el gate:** `gate/reglas/integridad-del-protocolo.json`.

⚠ Esto no es una preferencia: es lo que hace que el producto sirva. Si el gate pasa y la regla se incumple, **la comprobación está mal escrita** — no el producto. Dilo en vez de seguir adelante.

## 4 · Cuándo está terminado

`make demo` abre la App en `localhost:3118` y el overlay muestra una Sugerencia de demo; el contrato pasa (schema al día y Zod y Rust de acuerdo en cada ejemplo); `make verify` termina en verde (bun, Playwright, cargo).

Y en concreto, medido: **cuando todas las tareas de `PLAN.md` están hechas y `node gate/verificar.mjs` pasa entero** — la app se abre, las reglas se cumplen, los casos de cada tarea pasan y, si hay pantalla, sus pruebas de navegador también.

⚠ Las comprobaciones del gate son la parte de este proyecto que **no se discute**. El resto es prosa y se puede interpretar; una comprobación o pasa o no pasa.

## 5 · Cómo se construye

Con `/goal`, que recorre `PLAN.md` tarea a tarea: primero los casos de la tarea, en rojo; después el código, hasta que el gate entero pase. Cada tarea tiene un tope de **ilimitados intentos**: el bucle sigue hasta que el gate pasa, sin cambiar las pruebas para hacerlas pasar, sin `skip`/`only` y sin integrar (lo hace Jair).

⚠ El primer paso NO es escribir código: es correr `node gate/verificar.mjs` y verlo fallar. Si pasa antes de que exista nada, es que no está comprobando nada, y eso hay que decirlo en vez de celebrarlo.

## Lo que este documento NO decide

Ni cómo se escribe el código ni cómo se parte cada tarea por dentro. El orden de las tareas está en `PLAN.md`; aquí solo está qué tiene que existir y cómo se sabrá que existe.

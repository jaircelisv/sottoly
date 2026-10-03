# Handoff — Sottoly (noche del 2026-10-02 al 03)

Estado para que otra sesión continúe sin perder contexto. Léelo junto con [SPEC.md](../SPEC.md), [GLOSSARY.md](../GLOSSARY.md), [CLAUDE.md](../CLAUDE.md) y [docs/adr/](adr/). El contexto privado (rutas locales, Cloud, demo) está en `CLAUDE.local.md`, que no se versiona.

**Build Day: lunes 5 de octubre de 2026.** Objetivo único: en una Reunión real, Betty muestra al menos una Sugerencia útil en menos de 2 s, en el overlay.

---

## 1. Cómo se trabaja (obligatorio)

Loop por tarea (máx. ~1 h), con evidencia en git:

1. `test:` — escribir la prueba, correrla y verla fallar **por la razón correcta**; commit con la salida en rojo en el mensaje.
2. `feat:` / `fix:` — lo mínimo para pasar; correr **toda** la suite.
3. `refactor:` — solo con la suite en verde.
4. Verificar: `bun test` (engine), `cargo test` (si se tocó Rust), typecheck, gitleaks; Playwright para el overlay.
5. PR pequeño con qué hace, pruebas agregadas, salida de la suite y riesgos. **El autor hace el merge**, solo con checks en verde.

Reglas: nunca `skip`/`only` ni borrar o aflojar pruebas. Modelos reales (Jev, Sonnet) fuera del CI: respuestas grabadas; las corridas reales van al runner de evals. Para ajustar la Compuerta: primero fixtures etiquetados que reproduzcan el problema, luego cambiar prompt/umbral, comparar precisión y recall antes y después. Si una tarea pasa de 1 h o te bloqueas 20 min, para y avisa.

CI (`.github/workflows/sottoly-ci.yml`): `gitleaks`, `engine (bun test)`, `cargo test` (macOS, ~7 min con caché). `main` protegida: PR obligatorio y los tres checks requeridos.

---

## 2. Estado de la Fase 1 (Usuario / Contraparte): **hecha y medida**

Integrado en `main`:

| PR | Qué |
|---|---|
| #5 | Prueba de Meetily con tolerancia de punto flotante (`// SOTTOLY:`) + `cargo test` en CI. Propuesta upstream pendiente para después del Build Day. |
| #6 | `audio/speaker.rs`: `Speaker` (`user` / `counterpart` / `mixed`), `SpeakerSplitter` con un VAD por flujo. |
| #7 | `speaker` en `TranscriptUpdate` (evento `transcript-update`). |
| #8 | `pipeline.rs`: cada flujo pasa por su VAD; `SOTTOLY_SPEAKER_SEPARATION=0` vuelve al camino mezclado (`mixed`), que es el corte de la Fase 1. |
| #11 | Recorte a [-1, 1] antes de cada VAD. Sin esto la separación no producía ningún Segmento en la App real (Silero rechazaba la ventana). |
| #12 | `SOTTOLY_LATENCY` por Segmento final (latencia = reloj desde el inicio del pipeline − fin del audio). |
| #10 | Privacidad: `auto_save` en `false` por defecto (el audio no se guarda). |

Antes, el Motor (`engine/`): protocolo JSONL, Compuerta con Jev, Turnos, Roles, Redacción, antiruido, 5 fixtures sintéticos y contrato con Jev grabado (#1–#4).

Abierto: **#9** (SPEC: "Aprovechar Meetily", privacidad post-Build Day, plaude, tap global). Solo documentación; integrar cuando quieras.

---

## 3. Mediciones

### Segmentos (Q31), App real

Parakeet "Lightning", micrófono del MacBook Pro, salida por audífonos, **Mac en silencio**, 10 frases sintéticas reproducidas por el audio del sistema (`scripts/sottoly/latency/`):

| | ms |
|---|---|
| p50 | 802 (media de los dos centrales; `measure.sh` reporta 803 por nearest-rank) |
| p90 | 914 |
| máx | 949 |
| mín | 627 |

- 10/10 frases como `Counterpart`, 0 como `User`, 0 errores de rango.
- Calidad: **7/10 exactas**. 3 con el inicio cortado por el VAD ("~~Facturamos~~ anual…", "~~La~~ tarifa…", "~~Como acordamos,~~ el contrato…"); "más IVA" → "más y va".
- Decisión Q31 (p90 entre 700 y 1500 ms): **opción (a) + latido `clock`**.
- Presupuesto de 2 s: quedan ~1.090 ms para Compuerta (Jev p90 286 ms) + Redacción.

### Compuerta (Jev `jev-1.13.0`)

- 10 llamadas: p50 218 ms, p90 277 ms (la primera, en frío, 520 ms). La API acepta la versión fija.
- Línea base sobre 5 fixtures sintéticos (25 Turnos): precisión 0.60, recall 0.55, acierto de Rol 1.00. **Ojo:** `computeMetrics` todavía no tiene prueba; no uses estos números para decidir hasta que la tenga (tarea 3 abajo).
- Problemas conocidos: Sheldon (CEO adversarial) no pasa su umbral de 0.85 en ningún cierre apresurado; Betty repite en Turnos posteriores porque la ventana de 90 s conserva la cifra.

---

## 4. Decisiones de esta noche

- **plaude no corre junto con Sottoly.** Su módulo en vivo (ffmpeg grabando un dispositivo de audio en trozos de 5 s) compite por el audio y contamina las mediciones. El servicio de plaude queda pausado hasta después del Build Day.
- **El tap de audio del sistema de Meetily es global**: captura cualquier proceso, salga por el dispositivo que salga. Una pestaña del navegador sonando entró como Contraparte. Antes de cada Reunión (y de cada medición) silenciar todo lo demás; `measure.sh` lista los procesos con audio activo. Pregunta abierta en el SPEC: tapear solo los procesos de la Reunión.
- **Transcripciones**: Meetily las guarda en SQLite y además escribe `transcripts.json` en disco, aun con `auto_save` apagado. Se quedan para el Build Day; **primera tarea post-Build Day**: apagarlas por defecto y un comando o botón para borrar las de prueba. Borrar las Reuniones de prueba después de cada medición.
- **Audífonos** en el demo y en las mediciones, con el **micrófono del MacBook** como entrada (si los AirPods son también el micrófono, entran en modo llamada).
- **Cloud** (repo privado `sottoly-cloud`) no es prioridad hasta después del Build Day. Su estado está en `CLAUDE.local.md`.

### Keys (Keychain de macOS, cuenta `$USER`, servicio = nombre de la variable)

Nunca imprimir valores; leer con `security find-generic-password -a "$USER" -s <NOMBRE> -w`.

| Servicio | Uso |
|---|---|
| `TYPESAFE_AI_API_KEY` | Jev (Compuerta, runner de evals) |
| `ANTHROPIC_API_KEY` | Sonnet (Redacción) |

Las keys de Cloud también están en el Keychain; ver `CLAUDE.local.md`.

---

## 5. Cómo lanzar la App y medir latencia

Requisitos: Xcode (con la licencia aceptada), `cmake`, Bun, pnpm, Rust.

```bash
# Sidecar llama-helper (Tauri lo exige como externalBin; la primera vez o tras limpiar target/)
cargo build -p llama-helper --features metal
cp target/debug/llama-helper frontend/src-tauri/binaries/llama-helper-aarch64-apple-darwin

# App con logs a un archivo (env_logger escribe en stderr)
cd frontend && RUST_LOG=info pnpm run tauri:dev > ../app.log 2>&1
```

- `tauri dev` **recompila y reinicia la App cuando cambia el código de `src-tauri/`**. No cambies de rama en el checkout donde corre la App; usa `git worktree` para trabajar en otras ramas.
- Permisos: micrófono y audio del sistema concedidos a la terminal que lanza la App. No se concede Accesibilidad: iniciar/detener la grabación es manual (bandeja → *Start Recording*).

Medir:

1. Mac en silencio, audífonos, entrada = micrófono del MacBook.
2. Iniciar la grabación en la App.
3. `scripts/sottoly/latency/measure.sh app.log` — lista procesos con audio (solo debería aparecer Meetily), reproduce las 10 frases y muestra texto, latencias y p50/p90.
4. Detener la grabación y borrar la Reunión de prueba.

Evals de la Compuerta (desde `engine/`):

```bash
TYPESAFE_AI_API_KEY=$(security find-generic-password -a "$USER" -s TYPESAFE_AI_API_KEY -w) \
  bun ../evals/runner/run.ts --record   # contra Jev, graba respuestas
bun ../evals/runner/run.ts              # reproduce grabaciones
```

---

## 6. Tareas pendientes, en orden

1. **Acotar los Segmentos en vivo.** Con habla continua el VAD entregó un Segmento de 41 s (issue #756 de Meetily): el Motor queda ciego todo ese tiempo y la evaluación cada 10 s nunca se dispara. Prueba primero: habla continua de 30 s → Segmentos de máx. N s.
2. **Latido `clock`** desde la App (decisión Q31). Va con el puente `engine_bridge.rs` (Fase 2).
3. **Prueba de `computeMetrics`** antes de volver a reportar precisión o recall.
4. **Compuerta con evals**: fixtures que reproduzcan Sheldon < 0.85 y Betty repitiendo la cifra; medir antes, cambiar prompt o umbral, medir después.
5. **Pruebas faltantes del Motor**: mensaje `clock` y disparador `continuous` a través del `Engine`, y una Redacción que lanza error.
6. **Prueba de integración del sidecar** (`main.ts`): una línea JSONL entra por stdin, sale una Sugerencia por stdout, con proveedores grabados.
7. **Fase 2: puente App ↔ Motor** (`engine_bridge.rs`): lanzar el sidecar, reenviar Segmentos finales con `speaker`, emitir `clock`, leer Sugerencias.
8. **Overlay** (Fase 4) con 2–3 specs de Playwright (IPC simulado).
9. **Inicios de frase cortados por el VAD**: probar un pre-roll (padding antes del inicio de voz) con fixtures de audio.
10. Después del Build Day: transcripciones (SQLite + `transcripts.json`) apagadas por defecto y comando de borrado; propuesta upstream de la prueba de Meetily; tap solo de los procesos de la Reunión.

Corte de la Fase 1 ya no aplica: la separación funciona. Si algo la rompe antes del demo, `SOTTOLY_SPEAKER_SEPARATION=0`.

---

## 7. Prueba de punta a punta (2026-10-03, 00:27)

App real desde `main` + #24, sin modo demo, 10 frases de `phrases.txt` por el audio del sistema. Micrófono: los AirPods (modo llamada, 24 kHz) en vez del micrófono del MacBook. No afecta a la Contraparte (tap digital), pero hay que corregirlo antes del demo.

**Resultado: 0 Sugerencias.** Transcripción 10/10 como Contraparte. Compuerta: `cfo` en 9 Turnos (p 0,83–0,99) y `none` en "cerramos esta semana", 196–367 ms. La Redacción falló en los 9:

1. **`invalid_draft` (8 de 9):** Sonnet escribe 16–19 palabras y `validateDraft` descarta todo lo que pasa de 15. Pasa más cuando la ventana trae varias cifras ("No acepte aún: pida precio final con IVA, moneda, anticipo, aviso de renovación y tope del aumento.").
2. **`AI_NoOutputGeneratedError` (1 de 9, intermitente):** `claude-sonnet-5-5` abre un bloque de thinking adaptativo que se come los 200 tokens (`stop_reason: max_tokens`, sin texto). El thinking no se puede apagar en ese modelo: el SDK baja al mínimo (`between_tools`) y así salen 6/6, pero 2 siguen pasando de 15 palabras.
3. **Latencia de la Redacción:** Sonnet 2,2–3,2 s, Haiku 4.5 1,7–2,8 s (`generateText` sin streaming, salida estructurada). Haiku: 6/6 con ≤ 15 palabras. El presupuesto del SPEC es 500–800 ms.

Latencia medida, fin del habla → decisión de la Compuerta: p50 1.246 ms, p90 1.812 ms (Segmento + cierre del Turno por el latido + Jev). Con 2 s de Redacción, la tarjeta llegaría a ~3,2 s (p50). No hubo tarjeta, así que no hay medición fin del habla → tarjeta.

**Decisiones para mañana (del autor):**
- Modelo de Redacción: Haiku 4.5 (`claude-haiku-4-5-20251001`, ya permitido por el SPEC como cambio de una línea) o seguir con Sonnet.
- Regla de 15 palabras: recortar o pedir de nuevo en vez de descartar, o subir el tope.
- Streaming de la Redacción (SPEC §4) para bajar el tiempo a la primera palabra.
- Bajar el fin del habla → Compuerta: `turns.gapSeconds` 0,7 s sobre `t1`, que ya trae 400 ms de post-pad.

**Arranque de la App en desarrollo:** si la ventana principal se abre mientras Next todavía compila, queda colgada con `ChunkLoadError: Loading chunk app/layout failed (timeout)` y las recargas no llegan a Next. Solución: levantar `pnpm dev`, precalentar con `curl http://localhost:3118/` y lanzar `pnpm tauri dev --config '{"build":{"beforeDevCommand":""}}' -- --features coreml`.

**PRs apilados:** al integrar un PR cuya base no es `main`, el código queda en la rama de abajo (pasó con #16–#18 y #22–#23). Abrir cada PR contra `main`.

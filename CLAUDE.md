<!-- SOTTOLY: inicio. Esta sección es de Sottoly; lo que sigue después es la guía original de Meetily. -->
# Sottoly — reglas para Claude Code

Lee antes de trabajar:

0. **El harness** (más abajo en este archivo): [PRD.md](PRD.md) dice qué se construye en esta etapa, [PLAN.md](PLAN.md) en qué orden, y `node gate/verificar.mjs` si funciona.
1. [GLOSSARY.md](GLOSSARY.md): usa siempre estos términos en código, UI y docs. Si encuentras un término de "No usar", corrígelo.
2. [SPEC.md](SPEC.md): decisiones, alcance y plan. Si algo no está ahí, no lo construyas. No implementes nada de "Preguntas abiertas" ni de "Fuera de alcance del MVP".
3. [docs/adr/](docs/adr/): antes de cambiar algo cubierto por un ADR, léelo. Si la decisión cambia, escribe un ADR nuevo que reemplace al anterior; no edites el viejo.

## Reglas

- **Fork fiel de Meetily (ADR-0001):** no muevas ni borres carpetas ni proveedores de Meetily. El código de Sottoly va en `engine/`, `roles/`, `evals/`, `docs/` o en archivos nuevos (`engine_bridge.rs`, `overlay/`). Las ediciones inevitables a archivos de Meetily van marcadas con `// SOTTOLY:`. No hagas merge de `upstream` antes del Build Day.
- **Repo público (ADR-0002):** nunca escribas en archivos versionados rutas personales, nombres de personas reales, datos de clientes, referencias a otras empresas del autor, precios o estrategia comercial, keys, tokens ni `.env`. El contexto privado vive en `~/.sottoly/CLAUDE.private.md`, fuera del repo; cada worktree lo importa desde un `CLAUDE.local.md` de una línea (ignorado por git).
- **Identificadores en inglés:** claves, enums, tipos, archivos y eventos en inglés. El contenido humano (transcripción, Sugerencia, motivo, instrucciones de Rol) va en el idioma de la Reunión. La UI del MVP va en español.
- **Compuerta:** elige Roles (`gate_option`), nunca Personas. La Persona no entra al prompt de la Compuerta. Cambiar `gate_option` o `gate_definition` exige recalibrar y actualizar `calibrated_with`.
- **Modelos:** los IDs viven en `engine/config.json`, nunca en el código ni en los Roles. IDs exactos, sin alias. Cambiar un ID es una decisión explícita.
- **Pruebas:** ninguna tarea está terminada sin prueba. Escribe o actualiza la prueba, implementa, corre, itera hasta verde y abre el PR. No desactives, borres ni marques como skip una prueba para que pase; si una prueba está mal, explícalo en el PR.
- **PRs:** `main` está protegida. Todo cambio entra por PR con los checks en verde: uno pequeño por tarea, siempre con `gh pr create --repo jaircelisv/sottoly --base main` (sin `--repo` se abre en el upstream de Meetily) y **nunca apilado** (al integrar uno apilado, el código queda en la rama de abajo). Commits `test:` (en rojo por la razón correcta) → `feat:` / `fix:` → `refactor:`. Jair hace el merge.
- **Privacidad:** no guardes audio. No guardes transcripciones por defecto. Las keys van en el Keychain. Sin telemetría.

## Comandos

El `Makefile` de la raíz es el punto de entrada (tarea 1 del plan): `make verify`, `make sidecars`, `make demo` (App en `http://localhost:3118`), `make measure`, `make worktree NAME=…`. Mientras no exista:

```bash
# App sin ChunkLoadError: Next primero (puerto 3118), precalentado, luego Tauri sin beforeDevCommand
cd frontend && pnpm dev
curl -s localhost:3118/ >/dev/null; curl -s localhost:3118/_next/static/chunks/app/layout.js >/dev/null
RUST_LOG=info pnpm tauri dev --config '{"build":{"beforeDevCommand":""}}' -- --features coreml

# Motor
cd engine && bun install && bun test
```

`tauri dev` recompila y reinicia la App cuando cambia el código de `src-tauri/`: no cambies de rama en el checkout donde corre la App; trabaja en otro worktree.

---

# Harness: el gate, el plan y el bucle

## Dónde está la verdad

- **Qué** se construye en esta etapa está en **`PRD.md`**. Léelo antes de escribir una línea de código.
- **En qué orden** está en **`PLAN.md`**: las tareas, una detrás de otra.
- **Si funciona** lo dice **`node gate/verificar.mjs`**, y nada más. Ni tu impresión, ni la mía.

## Qué mide el gate

`node gate/verificar.mjs` prueba el producto entero y da un solo veredicto:

- **El arranque.** `make demo` y comprueba que `http://localhost:3118` responde (`gate/gate.json`).
- **Las reglas que no se negocian**, un archivo por regla en `gate/reglas/`.
- **Los casos de cada tarea**, en `gate/casos/`: un archivo por tarea, con la entrada con la que se llama a una función de un módulo JavaScript y lo que tiene que devolver. Si lo que se mide es Rust, el módulo `.mjs` llama a un binario de Rust (no importa el `.rs`).
- **Los tests del proyecto**: `make verify` tiene que salir bien y no con menos tests que la última vez.
- **La pantalla**: las pruebas de `gate/e2e/` abren un navegador de verdad.

La salida dice qué pasó, qué no y qué esperaba. **Esa salida es la única fuente de verdad.** Al principio **todo sale en rojo**, y es lo correcto: todavía no hay `Makefile` ni contrato.

## El gate crece, pero no encoge

- **Añadir una comprobación es libre**: un archivo **nuevo** en `gate/casos/`, `gate/e2e/` o `gate/reglas/`. Se hace con `/caso`.
- **Cambiar una que ya existe lo decide Jair**, igual que `gate/gate.json`. Claude Code se lo preguntará; explícale antes por qué. Sin nadie delante que conteste, el cambio se bloquea.
- **Quitar una no sirve: el trinquete.** Cada vez que el gate pasa entero, apunta en `.harness/` lo que pasó. Si la próxima vez falta algo, no pasa.
- **Bajar esa marca es solo de Jair**, en su terminal: `node gate/verificar.mjs --aceptar-menos`. Tú no puedes correrlo.

## Reglas del juego

- El código del producto vive donde ya vive (ADR-0001): `engine/`, `frontend/`, `overlay/`, `roles/`, `evals/`, `scripts/sottoly/`. **No hay `src/` en la raíz.**
- **Intocables, siempre**: `PRD.md`, `CLAUDE.md`, `.claude/`, `.mcp.json`, `.harness/` y `gate/verificar.mjs`. Hacer pasar el gate cambiando el gate es hacer trampa.
- **`PLAN.md` lo actualizas tú** al terminar cada tarea. Cambiar el orden, quitar una tarea o añadir una nueva lo decide Jair.
- **Prohibido el overfitting**: nada de condiciones atadas a los textos literales de los casos.
- **Nunca declares que algo funciona sin haber corrido `node gate/verificar.mjs` y mostrado el resultado.**
- **Intentos: sin límite.** El bucle sigue hasta que el gate pasa, sin cambiar las pruebas para hacerlas pasar, sin `skip`/`only` y sin integrar.

Los hooks de `.claude/hooks/` hacen cumplir parte de esto: impiden escribir en lo intocable, preguntan antes de cambiar una comprobación existente, bloquean comandos sin vuelta atrás (`rm -rf`, `push --force`; `--force-with-lease` sí se permite), bloquean keys en el contenido que se escribe y avisan si terminas habiendo cambiado código después de la última medición. Sus pruebas: `bun test scripts/sottoly/harness`.

## Un criterio se escribe como caso antes que como código

Cada tarea empieza igual: **primero sus casos, y se ven fallar; después el código que los cumple**. Si aparece un criterio que el gate todavía no mide, se convierte en caso con `/caso`, se ve en rojo y entonces se escribe el código. **Un caso que jamás se ha visto en rojo puede no estar comprobando nada.**

## La regla que no se negocia

- **Ningún mensaje cruza App ↔ Motor sin coincidir con el contrato definido en `engine/src/protocol.ts` (Zod).** — Si no, la App y el Motor pierden mensajes o los procesan distinto (pasó con `role_label` y con el `id` de la Sugerencia). La mide el gate: `gate/reglas/integridad-del-protocolo.json`.

Si el gate pasa y la regla se incumple, lo que está mal es la comprobación, no el producto: dilo.

## Cómo no engañarte a ti mismo

1. **Un guardián que nunca has visto fallar puede no estar comprobando nada.** Rómpelo a propósito, mira que se pone rojo y vuelve a dejarlo como estaba.
2. **Comprueba el efecto, no la apariencia.**
3. **Lee la salida entera del gate, no su última línea.**
4. **Leer el código no es mirar la pantalla.** Si la afirmación es sobre lo que ve una persona, hay que mirarlo.
5. **Nada está terminado hasta que una persona puede llegar.**
6. **Antes de guardar tu trabajo, mira qué hay en la carpeta.**

## Cuando no sepas algo, míralo

Antes de inventarte cómo funciona una librería, una API o un formato, consulta su documentación oficial y di de dónde lo sacaste. Pero la documentación no sustituye al gate.

## El bucle y Linear

- `/goal` (`.claude/skills/goal/`) recorre `PLAN.md` tarea a tarea; `/caso` agrega una comprobación nueva.
- `/linear-setup` copia `PLAN.md` a Linear (proyecto **Sottoly**). `.mcp.json` trae el servidor de Linear: la primera vez, `/mcp` → `linear-server` → autorizar, con Claude Code abierto en la raíz del repo.
- En Linear: **ningún número que no venga del gate** y **nada de issues especulativos**, solo las tareas de `PLAN.md`.
<!-- SOTTOLY: fin -->

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Meetily** is a privacy-first AI meeting assistant that captures, transcribes, and summarizes meetings entirely on local infrastructure. The supported application is the Tauri desktop app with a Rust core.

1. **Frontend**: Tauri-based desktop application (Rust + Next.js + TypeScript)
2. **Rust Backend**: Tauri commands, audio capture, transcription, storage, and summarization orchestration
3. **Legacy Backend Archive**: the old Python/FastAPI, Docker, and standalone whisper-server backend under `backend/` is archived and unsupported

### Key Technology Stack
- **Desktop App**: Tauri 2.x (Rust) + Next.js 14 + React 18
- **Audio Processing**: Rust (cpal, whisper-rs, professional audio mixing)
- **Transcription**: Whisper.cpp / whisper-rs and Parakeet paths in the Tauri app
- **App API Surface**: Tauri commands and events, not a separate FastAPI service
- **LLM Integration**: Ollama (local), Claude, Groq, OpenRouter

## Essential Development Commands

### Frontend Development (Tauri Desktop App)

**Location**: `/frontend`

```bash
# macOS Development
./clean_run.sh              # Clean build and run with info logging
./clean_run.sh debug        # Run with debug logging
./clean_build.sh            # Production build

# Windows Development
clean_run_windows.bat       # Clean build and run
clean_build_windows.bat     # Production build

# Manual Commands
pnpm install                # Install dependencies
pnpm run dev                # Next.js dev server (port 3118)
pnpm run tauri:dev          # Full Tauri development mode
pnpm run tauri:build        # Production build

# GPU-Specific Builds (for testing acceleration)
pnpm run tauri:dev:metal    # macOS Metal GPU
pnpm run tauri:dev:cuda     # NVIDIA CUDA
pnpm run tauri:dev:vulkan   # AMD/Intel Vulkan
pnpm run tauri:dev:cpu      # CPU-only (no GPU)
```

### Legacy Backend Archive

**Location**: `/backend`

The Python/FastAPI backend, Docker setup, and standalone whisper-server scripts are archived for historical reference and migration context only. Do not use them for current development, new installs, production deployments, or issue triage for the supported app.

The archived FastAPI service had unauthenticated, development-oriented CORS behavior. Treat that behavior as obsolete legacy context, not as a supported production API.

### Service Endpoints
- **Frontend Dev**: http://localhost:3118

## High-Level Architecture

### Tauri Desktop Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Frontend (Tauri Desktop App)                  │
│  ┌──────────────────┐  ┌─────────────────┐  ┌────────────────┐ │
│  │   Next.js UI     │  │  Rust Backend   │  │ Whisper Engine │ │
│  │  (React/TS)      │←→│  (Audio + IPC)  │←→│  (Local STT)   │ │
│  └──────────────────┘  └─────────────────┘  └────────────────┘ │
│         ↑ Tauri Events           ↑ Audio Pipeline               │
└─────────────────────────────────────────────────────────────────┘
```

The current app does not require a separate FastAPI tier. Meeting persistence, local transcription, and summary orchestration are handled through the Rust/Tauri core.

### Audio Processing Pipeline (Critical Understanding)

The audio system has **two parallel paths** with different purposes:

```
Raw Audio (Mic + System)
         ↓
┌────────────────────────────────────────────────────────────┐
│              Audio Pipeline Manager                         │
│  (frontend/src-tauri/src/audio/pipeline.rs)                │
└─────────────┬──────────────────────────┬───────────────────┘
              ↓                          ↓
    ┌─────────────────┐        ┌─────────────────────┐
    │ Recording Path  │        │ Transcription Path  │
    │ (Pre-mixed)     │        │ (VAD-filtered)      │
    └─────────────────┘        └─────────────────────┘
              ↓                          ↓
    RecordingSaver.save()      WhisperEngine.transcribe()
```

**Key Insight**: The pipeline performs **professional audio mixing** (RMS-based ducking, clipping prevention) for recording, while simultaneously applying **Voice Activity Detection (VAD)** to send only speech segments to Whisper for transcription.

### Audio Device Modularization (Recently Completed)

**Context**: The audio system was refactored from a monolithic 1028-line `core.rs` file into focused modules. See [AUDIO_MODULARIZATION_PLAN.md](AUDIO_MODULARIZATION_PLAN.md) for details.

```
audio/
├── devices/                    # Device discovery and configuration
│   ├── discovery.rs           # list_audio_devices, trigger_audio_permission
│   ├── microphone.rs          # default_input_device
│   ├── speakers.rs            # default_output_device
│   ├── configuration.rs       # AudioDevice types, parsing
│   └── platform/              # Platform-specific implementations
│       ├── windows.rs         # WASAPI logic (~200 lines)
│       ├── macos.rs           # ScreenCaptureKit logic
│       └── linux.rs           # ALSA/PulseAudio logic
├── capture/                   # Audio stream capture
│   ├── microphone.rs          # Microphone capture stream
│   ├── system.rs              # System audio capture stream
│   └── core_audio.rs          # macOS ScreenCaptureKit integration
├── pipeline.rs                # Audio mixing and VAD processing
├── recording_manager.rs       # High-level recording coordination
├── recording_commands.rs      # Tauri command interface
└── recording_saver.rs         # Audio file writing
```

**When working on audio features**:
- Device detection issues → `devices/discovery.rs` or `devices/platform/{windows,macos,linux}.rs`
- Microphone/speaker problems → `devices/microphone.rs` or `devices/speakers.rs`
- Audio capture issues → `capture/microphone.rs` or `capture/system.rs`
- Mixing/processing problems → `pipeline.rs`
- Recording workflow → `recording_manager.rs`

### Rust ↔ Frontend Communication (Tauri Architecture)

**Command Pattern** (Frontend → Rust):
```typescript
// Frontend: src/app/page.tsx
await invoke('start_recording', {
  mic_device_name: "Built-in Microphone",
  system_device_name: "BlackHole 2ch",
  meeting_name: "Team Standup"
});
```

```rust
// Rust: src/lib.rs
#[tauri::command]
async fn start_recording<R: Runtime>(
    app: AppHandle<R>,
    mic_device_name: Option<String>,
    system_device_name: Option<String>,
    meeting_name: Option<String>
) -> Result<(), String> {
    // Implementation delegates to audio::recording_commands
}
```

**Event Pattern** (Rust → Frontend):
```rust
// Rust: Emit transcript updates
app.emit("transcript-update", TranscriptUpdate {
    text: "Hello world".to_string(),
    timestamp: chrono::Utc::now(),
    // ...
})?;
```

```typescript
// Frontend: Listen for events
await listen<TranscriptUpdate>('transcript-update', (event) => {
  setTranscripts(prev => [...prev, event.payload]);
});
```

### Whisper Model Management

**Model Storage Locations**:
- **Development**: `frontend/models/`
- **Production (macOS)**: `~/Library/Application Support/Meetily/models/`
- **Production (Windows)**: `%APPDATA%\Meetily\models\`

**Model Loading** (frontend/src-tauri/src/whisper_engine/whisper_engine.rs):
```rust
pub async fn load_model(&self, model_name: &str) -> Result<()> {
    // Automatically detects GPU capabilities (Metal/CUDA/Vulkan)
    // Falls back to CPU if GPU unavailable
}
```

**GPU Acceleration**:
- **macOS**: Metal + CoreML (automatically enabled)
- **Windows/Linux**: CUDA (NVIDIA), Vulkan (AMD/Intel), or CPU
- Configure via Cargo features: `--features cuda`, `--features vulkan`

## Critical Development Patterns

### 1. Audio Buffer Management

**Ring Buffer Mixing** (pipeline.rs):
- Mic and system audio arrive asynchronously at different rates
- Ring buffer accumulates samples until both streams have aligned windows (50ms)
- Professional mixing applies RMS-based ducking to prevent system audio from drowning out microphone
- Uses `VecDeque` for efficient windowed processing

### 2. Thread Safety and Async Boundaries

**Recording State** (recording_state.rs):
```rust
pub struct RecordingState {
    is_recording: Arc<AtomicBool>,
    audio_sender: Arc<RwLock<Option<mpsc::UnboundedSender<AudioChunk>>>>,
    // ...
}
```

**Key Pattern**: Use `Arc<RwLock<T>>` for shared state across async tasks, `Arc<AtomicBool>` for simple flags.

### 3. Error Handling and Logging

**Performance-Aware Logging** (lib.rs):
```rust
#[cfg(debug_assertions)]
macro_rules! perf_debug {
    ($($arg:tt)*) => { log::debug!($($arg)*) };
}

#[cfg(not(debug_assertions))]
macro_rules! perf_debug {
    ($($arg:tt)*) => {};  // Zero overhead in release builds
}
```

**Usage**: Use `perf_debug!()` and `perf_trace!()` for hot-path logging that should be eliminated in production.

### 4. Frontend State Management

**Sidebar Context** (components/Sidebar/SidebarProvider.tsx):
- Global state for meetings list, current meeting, recording status
- Communicates with the Rust/Tauri core through Tauri commands and events
- Keeps React state synchronized with native recording, meeting, transcript, and summary state

**Pattern**: Tauri commands update Rust state → Emit events → Frontend listeners update React state → Context propagates to components

## Common Development Tasks

### Adding a New Audio Device Platform

1. Create platform file: `audio/devices/platform/{platform_name}.rs`
2. Implement device enumeration for the platform
3. Add platform-specific configuration in `audio/devices/configuration.rs`
4. Update `audio/devices/platform/mod.rs` to export new platform functions
5. Test with `cargo check` and platform-specific device tests

### Adding a New Tauri Command

1. Define command in `src/lib.rs`:
   ```rust
   #[tauri::command]
   async fn my_command(arg: String) -> Result<String, String> { /* ... */ }
   ```
2. Register in `tauri::Builder`:
   ```rust
   .invoke_handler(tauri::generate_handler![
       start_recording,
       my_command,  // Add here
   ])
   ```
3. Call from frontend:
   ```typescript
   const result = await invoke<string>('my_command', { arg: 'value' });
   ```

### Modifying Audio Pipeline Behavior

**Location**: `frontend/src-tauri/src/audio/pipeline.rs`

Key components:
- `AudioMixerRingBuffer`: Manages mic + system audio synchronization
- `ProfessionalAudioMixer`: RMS-based ducking and mixing
- `AudioPipelineManager`: Orchestrates VAD, mixing, and distribution

**Testing Audio Changes**:
```bash
# Enable verbose audio logging
RUST_LOG=app_lib::audio=debug ./clean_run.sh

# Monitor audio metrics in real-time
# Check Developer Console in the app (Cmd+Shift+I on macOS)
```

### Tauri Backend Development

Current app behavior should be implemented in the Rust/Tauri core, not in the archived Python backend. Add new frontend-facing behavior through Tauri commands/events and existing Rust services under `frontend/src-tauri/src`.

Do not add new endpoints to `backend/app/main.py`; that FastAPI code is legacy archive material only.

## Testing and Debugging

### Frontend Debugging

**Enable Rust Logging**:
```bash
# macOS
RUST_LOG=debug ./clean_run.sh

# Windows (PowerShell)
$env:RUST_LOG="debug"; ./clean_run_windows.bat
```

**Developer Tools**:
- Open DevTools: `Cmd+Shift+I` (macOS) or `Ctrl+Shift+I` (Windows)
- Console Toggle: Built into app UI (console icon)
- View Rust logs: Check terminal output

### Audio Pipeline Debugging

**Key Metrics** (emitted by pipeline):
- Buffer sizes (mic/system)
- Mixing window count
- VAD detection rate
- Dropped chunk warnings

**Monitor via Developer Console**: The app includes real-time metrics display when recording.

## Platform-Specific Notes

### macOS
- **Audio Capture**: Uses ScreenCaptureKit for system audio (macOS 13+)
- **GPU**: Metal + CoreML automatically enabled
- **Permissions**: Requires microphone + screen recording permissions
- **System Audio**: Requires virtual audio device (BlackHole) for system capture

### Windows
- **Audio Capture**: Uses WASAPI (Windows Audio Session API)
- **GPU**: CUDA (NVIDIA) or Vulkan (AMD/Intel) via Cargo features
- **Build Tools**: Requires Visual Studio Build Tools with C++ workload
- **System Audio**: Uses WASAPI loopback for system capture

### Linux
- **Audio Capture**: ALSA/PulseAudio
- **GPU**: CUDA (NVIDIA) or Vulkan via Cargo features
- **Dependencies**: Requires cmake, llvm, libomp

## Performance Optimization Guidelines

### Audio Processing
- Use `perf_debug!()` / `perf_trace!()` for hot-path logging (zero cost in release)
- Batch audio metrics using `AudioMetricsBatcher` (pipeline.rs)
- Pre-allocate buffers with `AudioBufferPool` (buffer_pool.rs)
- VAD filtering reduces Whisper load by ~70% (only processes speech)

### Whisper Transcription
- **Model Selection**: Balance accuracy vs speed
  - Development: `base` or `small` (fast iteration)
  - Production: `medium` or `large-v3` (best quality)
- **GPU Acceleration**: 5-10x faster than CPU
- **Parallel Processing**: Available in `whisper_engine/parallel_processor.rs` for batch workloads

### Frontend Performance
- React state updates batched via Sidebar context
- Transcript rendering virtualized for large meetings
- Audio level monitoring throttled to 60fps

## Important Constraints and Gotchas

1. **Audio Chunk Size**: Pipeline expects consistent 48kHz sample rate. Resampling happens at capture time.

2. **Platform Audio Quirks**:
   - macOS: ScreenCaptureKit requires macOS 13+, needs screen recording permission
   - Windows: WASAPI exclusive mode can conflict with other apps
   - System audio requires virtual device (BlackHole on macOS, WASAPI loopback on Windows)

3. **Whisper Model Loading**: Models are loaded once and cached. Changing models requires app restart or manual unload/reload.

4. **No Separate Backend Dependency**: Meeting persistence, transcription, and LLM features are handled by the Tauri app. Do not reintroduce the archived FastAPI backend as a supported requirement.

5. **Legacy FastAPI Security Context**: The archived FastAPI/CORS behavior is unsupported legacy code and must not be treated as a supported production API.

6. **File Paths**: Use Tauri's path APIs (`downloadDir`, etc.) for cross-platform compatibility. Never hardcode paths.

7. **Audio Permissions**: Request permissions early. macOS requires both microphone AND screen recording for system audio.

## Repository-Specific Conventions

- **Logging Format**: Rust logs should include enough module context to diagnose app behavior
- **Error Handling**: Rust uses `anyhow::Result`, frontend uses try-catch with user-friendly messages
- **Naming**: Audio devices use "microphone" and "system" consistently (not "input"/"output")
- **Git Branches**:
  - `main`: Stable releases
  - `fix/*`: Bug fixes
  - `enhance/*`: Feature enhancements
  - Current: `fix/audio-mixing` (working on audio pipeline improvements)

## Key Files Reference

**Core Coordination**:
- [frontend/src-tauri/src/lib.rs](frontend/src-tauri/src/lib.rs) - Main Tauri entry point, command registration
- [frontend/src-tauri/src/audio/mod.rs](frontend/src-tauri/src/audio/mod.rs) - Audio module exports
- [frontend/src-tauri/src/database/mod.rs](frontend/src-tauri/src/database/mod.rs) - Local database module

**Audio System**:
- [frontend/src-tauri/src/audio/recording_manager.rs](frontend/src-tauri/src/audio/recording_manager.rs) - Recording orchestration
- [frontend/src-tauri/src/audio/pipeline.rs](frontend/src-tauri/src/audio/pipeline.rs) - Audio mixing and VAD
- [frontend/src-tauri/src/audio/recording_saver.rs](frontend/src-tauri/src/audio/recording_saver.rs) - Audio file writing

**UI Components**:
- [frontend/src/app/page.tsx](frontend/src/app/page.tsx) - Main recording interface
- [frontend/src/components/Sidebar/SidebarProvider.tsx](frontend/src/components/Sidebar/SidebarProvider.tsx) - Global state management

**Whisper Integration**:
- [frontend/src-tauri/src/whisper_engine/whisper_engine.rs](frontend/src-tauri/src/whisper_engine/whisper_engine.rs) - Whisper model management and transcription

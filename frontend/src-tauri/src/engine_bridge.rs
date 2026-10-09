// SOTTOLY: puente App ↔ Motor (SPEC §4). Archivo nuevo para no tocar Meetily (ADR-0001).
// Habla con el sidecar `sottoly-engine` por stdin/stdout, una línea JSON por mensaje.

use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Mutex;
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use log::{debug, info, warn};
use serde::{Deserialize, Serialize};

use crate::audio::speaker::Speaker;

/// Un Mutex envenenado (pánico en otro hilo) no debe apagar el puente: se sigue con su valor.
fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// Mensajes app → engine (`engine/src/protocol.ts`).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum EngineMessage {
    Segment { speaker: Speaker, text: String, t0: f64, t1: f64 },
    Session { event: SessionEvent, #[serde(skip_serializing_if = "Option::is_none")] roles: Option<Vec<String>> },
    Clock { t: f64 },
    /// El Usuario le escribe a un Rol en el chat (tarea 13); `reply_to`: la Sugerencia que responde.
    Chat {
        id: String,
        role: String,
        text: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        reply_to: Option<String>,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SessionEvent {
    Start,
    End,
}

/// Sugerencia final del Motor (engine → app); `id` es el de sus deltas.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SuggestionMessage {
    pub id: String,
    pub role: String,
    /// Nombre visible del Rol ("CFO"); el overlay lo exige (protocolo, #20).
    pub role_label: String,
    pub persona: String,
    pub text: String,
    pub reason: String,
    pub confidence: f64,
}

/// Redacción en curso: `text` es el texto acumulado hasta ahora (sin motivo).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SuggestionDelta {
    pub id: String,
    pub role: String,
    pub role_label: String,
    pub persona: String,
    pub text: String,
}

/// Decisión que el Motor propone al cerrar la Reunión (`Decision` en `protocol.ts`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Decision {
    pub id: String,
    pub kind: DecisionKind,
    pub text: String,
    pub owner: DecisionOwner,
    pub due: Option<String>,
    pub source: DecisionSource,
    pub meeting_id: String,
    pub created_at: String,
    pub approved: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DecisionKind {
    Decision,
    Commitment,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DecisionOwner {
    User,
    Counterpart,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DecisionSource {
    Engine,
    LiveMark,
}

/// Lo que el Motor imprime por stdout para la tarjeta. Se serializa con su `type`, tal como
/// lo valida el overlay con el zod de `protocol.ts`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum EngineEvent {
    SuggestionDelta(SuggestionDelta),
    Suggestion(SuggestionMessage),
    SuggestionCancel { id: String },
    // SOTTOLY: antes el puente descartaba el summary (Decisiones al cerrar), que el contrato sí define.
    Summary {
        /// Título que propone el modelo (tarea 28); el protocolo lo exige no vacío cuando viene.
        #[serde(default, skip_serializing_if = "Option::is_none", deserialize_with = "non_empty_title")]
        title: Option<String>,
        decisions: Vec<Decision>,
    },
    /// Chat con el Rol (tarea 13): texto acumulado mientras llega, la respuesta final, o que no pudo responder.
    ChatDelta { id: String, role: String, text: String },
    ChatReply { id: String, role: String, text: String },
    ChatError { id: String },
}

/// `title` del `summary`: si viene, no puede ser vacío (`z.string().min(1)` en `protocol.ts`).
fn non_empty_title<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Option<String>, D::Error> {
    let title = Option::<String>::deserialize(d)?;
    match title {
        Some(t) if t.trim().is_empty() => Err(serde::de::Error::custom("title vacío")),
        other => Ok(other),
    }
}

impl EngineEvent {
    /// Nombre del evento de Tauri: el mismo `type` del protocolo.
    pub fn tauri_event(&self) -> &'static str {
        match self {
            EngineEvent::SuggestionDelta(_) => "suggestion_delta",
            EngineEvent::Suggestion(_) => "suggestion",
            EngineEvent::SuggestionCancel { .. } => "suggestion_cancel",
            EngineEvent::Summary { .. } => "summary",
            EngineEvent::ChatDelta { .. } => "chat_delta",
            EngineEvent::ChatReply { .. } => "chat_reply",
            EngineEvent::ChatError { .. } => "chat_error",
        }
    }
}

/// Proceso del Motor con su stdin abierto. Cada evento de Sugerencia que imprime llega a `on_event`.
pub struct EngineBridge {
    child: Child,
    stdin: Mutex<Option<ChildStdin>>,
    reader: Option<JoinHandle<()>>,
}

impl EngineBridge {
    pub fn spawn(mut command: Command, on_event: impl Fn(EngineEvent) + Send + 'static) -> std::io::Result<Self> {
        let mut child = command.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn()?;
        let stdout = child.stdout.take().expect("stdout piped");
        let stderr = child.stderr.take().expect("stderr piped");

        let reader = std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                match serde_json::from_str::<EngineEvent>(&line) {
                    Ok(event) => on_event(event),
                    Err(_) => debug!("SOTTOLY engine: línea ignorada en stdout"),
                }
            }
        });
        // Los registros del Motor (decisiones de la Compuerta, errores) van por stderr.
        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                info!("SOTTOLY engine: {}", line);
            }
        });

        let stdin = Mutex::new(child.stdin.take());
        Ok(Self { child, stdin, reader: Some(reader) })
    }

    pub fn send(&self, message: &EngineMessage) -> std::io::Result<()> {
        let mut guard = lock(&self.stdin);
        let stdin = guard.as_mut().ok_or_else(|| std::io::Error::other("el Motor ya se cerró"))?;
        stdin.write_all(message.to_line().as_bytes())?;
        stdin.flush()
    }

    /// Cierra el stdin (el Motor cierra la Reunión y sale) y espera a que termine.
    pub fn finish(mut self) -> std::io::Result<()> {
        lock(&self.stdin).take();
        let status = self.child.wait()?;
        if let Some(reader) = self.reader.take() {
            let _ = reader.join();
        }
        if !status.success() {
            warn!("SOTTOLY engine terminó con {}", status);
        }
        Ok(())
    }
}

impl Drop for EngineBridge {
    fn drop(&mut self) {
        // Si nadie llamó a finish (la App se cierra), no dejar el Motor huérfano.
        if self.reader.is_some() {
            let _ = self.child.kill();
        }
    }
}

impl EngineMessage {
    /// Una línea JSONL lista para el stdin del Motor.
    pub fn to_line(&self) -> String {
        let mut line = serde_json::to_string(self).expect("EngineMessage siempre serializa");
        line.push('\n');
        line
    }
}

/// Latido `clock` (decisión Q31): le dice al Motor hasta qué segundo de audio ya no queda
/// habla por entregar, para que cierre el Turno abierto cuando la Contraparte se calla.
///
/// `t` es el mínimo entre lo que el VAD ya procesó sin habla en curso y el inicio de cada
/// Segmento que salió del VAD pero todavía no llegó transcrito. Así un latido nunca adelanta
/// a un Segmento que aún viene en camino.
pub struct EngineClock {
    interval_s: f64,
    pending_timeout: Duration,
    vad_safe_s: f64,
    /// Inicio (s) de cada Segmento en transcripción y cuándo salió del VAD.
    pending: Vec<(f64, Instant)>,
    last_sent: Option<f64>,
}

impl EngineClock {
    pub fn new(interval_s: f64, pending_timeout: Duration) -> Self {
        Self { interval_s, pending_timeout, vad_safe_s: 0.0, pending: Vec::new(), last_sent: None }
    }

    /// El VAD avanzó: `vad_safe_s` es hasta dónde no hay habla abierta; `sent` son los
    /// inicios (s) de los Segmentos que acaban de salir hacia la transcripción.
    pub fn on_vad_progress(&mut self, vad_safe_s: f64, sent: &[f64], now: Instant) {
        self.vad_safe_s = vad_safe_s;
        self.pending.extend(sent.iter().map(|t0| (*t0, now)));
    }

    /// Llegó transcrito el Segmento que empieza en `t0`.
    pub fn on_segment_delivered(&mut self, t0: f64) {
        if let Some(i) = self.pending.iter().position(|(start, _)| (start - t0).abs() < 1e-6) {
            self.pending.remove(i);
        }
    }

    /// Hasta qué segundo de audio no queda habla por entregar.
    pub fn safe_time(&self, now: Instant) -> f64 {
        self.pending
            .iter()
            .filter(|(_, sent_at)| now.duration_since(*sent_at) < self.pending_timeout)
            .map(|(start, _)| *start)
            .fold(self.vad_safe_s, f64::min)
    }

    /// Latido para mandar ahora, si el reloj avanzó al menos `interval_s` desde el último.
    pub fn tick(&mut self, now: Instant) -> Option<EngineMessage> {
        let t = self.safe_time(now);
        if self.last_sent.is_some_and(|last| t - last < self.interval_s) {
            return None;
        }
        self.last_sent = Some(t);
        Some(EngineMessage::Clock { t })
    }
}

/// Cada cuánto, como mínimo, avanza el latido (s de audio).
pub const CLOCK_INTERVAL_S: f64 = 0.1;
/// Cuánto frena el reloj un Segmento que no llega transcrito (Parakeet descarta los vacíos).
pub const PENDING_TIMEOUT: Duration = Duration::from_secs(2);

static CLOCK: std::sync::Mutex<Option<EngineClock>> = std::sync::Mutex::new(None);

fn with_clock<T>(f: impl FnOnce(&mut EngineClock) -> T) -> T {
    let mut guard = lock(&CLOCK);
    f(guard.get_or_insert_with(|| EngineClock::new(CLOCK_INTERVAL_S, PENDING_TIMEOUT)))
}

/// El pipeline avisa cada ventana: hasta dónde llegó el VAD y qué Segmentos mandó a transcribir.
pub fn on_vad_progress(vad_safe_s: f64, sent: &[f64]) {
    with_clock(|c| c.on_vad_progress(vad_safe_s, sent, Instant::now()));
}

/// El puente avisa cuando un Segmento llegó transcrito.
pub fn on_segment_delivered(t0: f64) {
    with_clock(|c| c.on_segment_delivered(t0));
}

/// Latido para mandar al Motor ahora, si toca.
pub fn next_clock() -> Option<EngineMessage> {
    with_clock(|c| c.tick(Instant::now()))
}

/// Nueva grabación: el tiempo de audio vuelve a cero.
pub fn reset_clock() {
    *lock(&CLOCK) = None;
}

// --- App ---------------------------------------------------------------------------------------

/// Líneas de log para medir fin del habla → tarjeta: el primer delta de cada id (la tarjeta
/// aparece) y el final (como SOTTOLY_LATENCY para los Segmentos).
#[derive(Default)]
struct StreamLog {
    started: std::collections::HashSet<String>,
}

impl StreamLog {
    fn line(&mut self, event: &EngineEvent, unix_ms: u128) -> Option<String> {
        match event {
            EngineEvent::SuggestionDelta(d) => self.started.insert(d.id.clone()).then(|| {
                format!("SOTTOLY_SUGGESTION_FIRST at_ms={} id={} role={} persona={}", unix_ms, d.id, d.role, d.persona)
            }),
            EngineEvent::Suggestion(s) => Some(format!(
                "SOTTOLY_SUGGESTION at_ms={} id={} role={} persona={} text={:?}",
                unix_ms, s.id, s.role, s.persona, s.text
            )),
            EngineEvent::SuggestionCancel { id } => Some(format!("SOTTOLY_SUGGESTION_CANCEL at_ms={} id={}", unix_ms, id)),
            // Sin el texto de las Decisiones: el log no guarda contenido de la Reunión.
            EngineEvent::Summary { decisions, .. } => Some(format!("SOTTOLY_SUMMARY at_ms={} decisions={}", unix_ms, decisions.len())),
            // Sin el texto del chat, por lo mismo; solo cuándo respondió.
            EngineEvent::ChatReply { id, role, .. } => Some(format!("SOTTOLY_CHAT_REPLY at_ms={} id={} role={}", unix_ms, id, role)),
            EngineEvent::ChatError { id } => Some(format!("SOTTOLY_CHAT_ERROR at_ms={} id={}", unix_ms, id)),
            EngineEvent::ChatDelta { .. } => None,
        }
    }
}

/// Keys que el Motor lee del entorno; en la App salen del Keychain (servicio = nombre).
const KEYCHAIN_KEYS: [&str; 2] = ["TYPESAFE_AI_API_KEY", "ANTHROPIC_API_KEY"];

fn keychain_secret(service: &str) -> Option<String> {
    let user = std::env::var("USER").ok()?;
    let out = Command::new("security")
        .args(["find-generic-password", "-a", &user, "-s", service, "-w"])
        .output()
        .ok()?;
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// Comando del Motor: `SOTTOLY_ENGINE_CMD` si está, si no el sidecar junto al ejecutable.
fn engine_command() -> Command {
    let mut command = match std::env::var("SOTTOLY_ENGINE_CMD") {
        Ok(cmd) => {
            let mut c = Command::new("sh");
            c.arg("-c").arg(cmd);
            c
        }
        Err(_) => {
            let dir = std::env::current_exe().ok().and_then(|p| p.parent().map(|d| d.to_path_buf())).unwrap_or_default();
            Command::new(dir.join("sottoly-engine"))
        }
    };
    if std::env::var_os("SOTTOLY_ROLES_DIR").is_none() {
        // MVP: roles/ del repo. Empaquetarlos como recurso queda para después del Build Day.
        command.env("SOTTOLY_ROLES_DIR", concat!(env!("CARGO_MANIFEST_DIR"), "/../../roles"));
    }
    for key in KEYCHAIN_KEYS {
        if std::env::var_os(key).is_none() {
            if let Some(secret) = keychain_secret(key) {
                command.env(key, secret);
            }
        }
    }
    command
}

/// Campos del `transcript-update` de Meetily que necesita el Motor.
#[derive(Deserialize)]
struct TranscriptPayload {
    text: String,
    is_partial: bool,
    audio_start_time: f64,
    audio_end_time: f64,
    speaker: Speaker,
}

/// Segmento para el Motor a partir de un `transcript-update`; los parciales no cuentan.
fn segment_from_transcript(payload: &str) -> Option<EngineMessage> {
    let t: TranscriptPayload = serde_json::from_str(payload).ok()?;
    (!t.is_partial).then(|| EngineMessage::Segment { speaker: t.speaker, text: t.text, t0: t.audio_start_time, t1: t.audio_end_time })
}

struct Session {
    bridge: std::sync::Arc<EngineBridge>,
    running: std::sync::Arc<std::sync::atomic::AtomicBool>,
}

static SESSION: Mutex<Option<Session>> = Mutex::new(None);

/// Guarda el `summary` del cierre con la Reunión, para revisarlo en el panel (tarea 17).
pub fn persist_summary(folder: Option<&std::path::Path>, event: &EngineEvent) {
    let EngineEvent::Summary { decisions, title } = event else { return };
    match folder {
        Some(folder) => {
            if let Err(e) = crate::sottoly_decisions::store_summary(folder, decisions) {
                warn!("SOTTOLY: no se pudieron guardar las Decisiones: {}", e);
            }
            // El título queda pendiente con la Reunión; el panel lo aplica (tarea 28).
            if let Some(title) = title {
                if let Err(e) = crate::sottoly_decisions::store_title(folder, title) {
                    warn!("SOTTOLY: no se pudo guardar el título propuesto: {}", e);
                }
            }
        }
        None => warn!("SOTTOLY: Reunión sin carpeta; las Decisiones del cierre no se guardan"),
    }
}

fn start_session<R: tauri::Runtime>(app: tauri::AppHandle<R>) {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use tauri::Emitter;

    stop_session();
    let emitter = app.clone();
    let stream_log = Mutex::new(StreamLog::default());
    // Carpeta de la Reunión en curso: ahí se guardan las Decisiones del cierre (tarea 17).
    let meeting_folder = crate::audio::recording_commands::current_meeting_folder();
    let bridge = match EngineBridge::spawn(engine_command(), move |event| {
        let now_ms = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
        if let Some(line) = lock(&stream_log).line(&event, now_ms) {
            info!("{}", line);
        }
        persist_summary(meeting_folder.as_deref(), &event);
        if let Err(e) = emitter.emit(event.tauri_event(), &event) {
            warn!("SOTTOLY: no se pudo emitir {}: {}", event.tauri_event(), e);
        }
    }) {
        Ok(b) => Arc::new(b),
        Err(e) => {
            warn!("SOTTOLY: no arrancó el Motor: {}", e);
            return;
        }
    };
    if let Err(e) = bridge.send(&EngineMessage::Session { event: SessionEvent::Start, roles: None }) {
        warn!("SOTTOLY: el Motor no aceptó session start: {}", e);
    }

    let running = Arc::new(AtomicBool::new(true));
    let (ticker_bridge, ticker_running) = (bridge.clone(), running.clone());
    std::thread::spawn(move || {
        while ticker_running.load(Ordering::SeqCst) {
            if let Some(clock) = next_clock() {
                let _ = ticker_bridge.send(&clock);
            }
            std::thread::sleep(Duration::from_millis(100));
        }
    });
    info!("SOTTOLY: Motor en marcha");
    *lock(&SESSION) = Some(Session { bridge, running });
}

fn send_segment(payload: &str) {
    let Some(segment) = segment_from_transcript(payload) else { return };
    if let EngineMessage::Segment { t0, .. } = &segment {
        on_segment_delivered(*t0);
    }
    if let Some(session) = lock(&SESSION).as_ref() {
        if let Err(e) = session.bridge.send(&segment) {
            warn!("SOTTOLY: no se pudo mandar el Segmento al Motor: {}", e);
        }
    }
}

/// Manda al Motor lo que el Usuario escribe en el chat (tarea 13). Devuelve el id con el que llegan
/// `chat_delta` / `chat_reply` / `chat_error`. Sin Reunión en curso no hay Motor que responda.
pub fn send_chat(role: String, text: String, reply_to: Option<String>) -> Result<String, String> {
    let id = format!("c-{}", uuid::Uuid::new_v4());
    let message = EngineMessage::Chat { id: id.clone(), role, text, reply_to };
    match lock(&SESSION).as_ref() {
        Some(session) => session.bridge.send(&message).map(|_| id).map_err(|e| format!("No se pudo hablar con el Motor: {e}")),
        None => Err("No hay una Reunión en curso: inicia la grabación para hablar con tu junta.".into()),
    }
}

#[tauri::command]
pub async fn sottoly_chat_send(role: String, text: String, reply_to: Option<String>) -> Result<String, String> {
    send_chat(role, text, reply_to)
}

fn stop_session() {
    let Some(session) = lock(&SESSION).take() else { return };
    session.running.store(false, std::sync::atomic::Ordering::SeqCst);
    // El Motor cierra la Reunión al ver EOF; puede tardar (Compuerta + Redacción), fuera del hilo de eventos.
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(150)); // deja salir el último latido
        if let Ok(bridge) = std::sync::Arc::try_unwrap(session.bridge) {
            let _ = bridge.finish();
        }
    });
}

/// Conecta el Motor al ciclo de la grabación de Meetily: arranca con `recording-started`, recibe
/// cada Segmento final de `transcript-update` y se cierra con `recording-stopped`.
pub fn install<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    use tauri::Listener;
    if std::env::var("SOTTOLY_ENGINE").map(|v| v == "0").unwrap_or(false) {
        info!("SOTTOLY: Motor apagado (SOTTOLY_ENGINE=0)");
        return;
    }
    let handle = app.clone();
    app.listen_any("recording-started", move |_| start_session(handle.clone()));
    app.listen_any("transcript-update", |event| send_segment(event.payload()));
    app.listen_any("recording-stopped", |_| stop_session());
}

#[cfg(test)]
mod tests {
    use super::*;

    /// SOTTOLY: el `summary` del protocolo (Decisiones al cerrar la Reunión) no se puede perder en el puente.
    #[test]
    fn bridge_accepts_the_protocol_summary() {
        let line = r#"{"type":"summary","decisions":[{"id":"d1","kind":"commitment","text":"El contador envía la declaración el viernes.","owner":"counterpart","due":"2026-10-09","source":"engine","meeting_id":"m1","created_at":"2026-10-04T15:00:00Z","approved":false}]}"#;
        let event = serde_json::from_str::<EngineEvent>(line);
        assert!(event.is_ok(), "el puente descarta el summary: {:?}", event.err());
        assert_eq!(event.unwrap().tauri_event(), "summary");
    }

    fn clock() -> EngineClock {
        EngineClock::new(0.25, Duration::from_secs(2))
    }

    use std::sync::mpsc;

    #[test]
    fn el_summary_del_cierre_se_guarda_en_la_carpeta_de_la_reunion() {
        let dir = tempfile::tempdir().unwrap();
        let event: EngineEvent = serde_json::from_str(r#"{"type":"summary","decisions":[{"id":"m-d1","kind":"decision","text":"Se contrata.","owner":"user","due":null,"source":"engine","meeting_id":"m","created_at":"2026-10-07T22:00:00Z","approved":false}]}"#).unwrap();
        persist_summary(Some(dir.path()), &event);
        let file = crate::sottoly_decisions::load_decisions(dir.path()).unwrap();
        assert_eq!((file.decisions.len(), file.reviewed), (1, false));
        // Otros eventos no escriben nada.
        let otra = tempfile::tempdir().unwrap();
        persist_summary(Some(otra.path()), &EngineEvent::ChatError { id: "c".into() });
        assert!(crate::sottoly_decisions::load_decisions(otra.path()).is_none());
    }

    // Chat con el Rol (tarea 13)
    #[test]
    fn el_chat_sale_como_lo_espera_el_motor() {
        let m = EngineMessage::Chat { id: "c1".into(), role: "cfo".into(), text: "¿Y el IVA?".into(), reply_to: Some("s1".into()) };
        assert_eq!(m.to_line(), "{\"type\":\"chat\",\"id\":\"c1\",\"role\":\"cfo\",\"text\":\"¿Y el IVA?\",\"reply_to\":\"s1\"}\n");
        let sin = EngineMessage::Chat { id: "c2".into(), role: "cfo".into(), text: "Hola".into(), reply_to: None };
        assert!(!sin.to_line().contains("reply_to"));
    }

    #[test]
    fn las_respuestas_del_chat_llegan_como_eventos_de_tauri() {
        let d: EngineEvent = serde_json::from_str(r#"{"type":"chat_delta","id":"c1","role":"cfo","text":"Pidió"}"#).unwrap();
        let r: EngineEvent = serde_json::from_str(r#"{"type":"chat_reply","id":"c1","role":"cfo","text":"Pidió un anticipo."}"#).unwrap();
        let e: EngineEvent = serde_json::from_str(r#"{"type":"chat_error","id":"c1"}"#).unwrap();
        assert_eq!((d.tauri_event(), r.tauri_event(), e.tauri_event()), ("chat_delta", "chat_reply", "chat_error"));
        assert!(serde_json::from_str::<EngineEvent>(r#"{"type":"chat_reply","role":"cfo","text":"sin id"}"#).is_err());
    }

    #[test]
    fn sin_reunion_en_curso_el_chat_lo_dice() {
        let err = send_chat("cfo".into(), "Hola".into(), None).unwrap_err();
        assert!(err.contains("inicia la grabación"), "{err}");
    }

    #[test]
    fn segment_and_session_serialize_like_the_engine_protocol() {
        let segment = EngineMessage::Segment { speaker: Speaker::Counterpart, text: "Son 18 millones.".into(), t0: 7.2, t1: 11.4 };
        assert_eq!(
            segment.to_line(),
            "{\"type\":\"segment\",\"speaker\":\"counterpart\",\"text\":\"Son 18 millones.\",\"t0\":7.2,\"t1\":11.4}\n"
        );
        let start = EngineMessage::Session { event: SessionEvent::Start, roles: Some(vec!["cfo".into()]) };
        assert_eq!(start.to_line(), "{\"type\":\"session\",\"event\":\"start\",\"roles\":[\"cfo\"]}\n");
        let end = EngineMessage::Session { event: SessionEvent::End, roles: None };
        assert_eq!(end.to_line(), "{\"type\":\"session\",\"event\":\"end\"}\n");
    }

    /// El overlay valida la Sugerencia con el zod del protocolo, que exige `role_label` (#20):
    /// el puente no puede descartarlo al pasar por serde.
    #[test]
    fn bridge_forwards_role_label_to_the_overlay() {
        let line = r#"{"type":"suggestion","id":"s1","role":"cfo","role_label":"CFO","persona":"Betty","text":"Pregunta si incluye IVA.","reason":"Precio sin impuestos.","confidence":0.9}"#;
        let event: EngineEvent = serde_json::from_str(line).unwrap();
        let out = serde_json::to_value(&event).unwrap();
        assert_eq!(out["role_label"], "CFO");
        assert_eq!(out["type"], "suggestion");
    }

    fn delta(id: &str, text: &str) -> EngineEvent {
        EngineEvent::SuggestionDelta(SuggestionDelta {
            id: id.into(),
            role: "cfo".into(),
            role_label: "CFO".into(),
            persona: "Betty".into(),
            text: text.into(),
        })
    }

    #[test]
    fn events_go_to_the_overlay_with_their_protocol_type() {
        let d = delta("s1", "Pregunta si");
        assert_eq!(d.tauri_event(), "suggestion_delta");
        assert_eq!(
            serde_json::to_value(&d).unwrap(),
            serde_json::json!({"type":"suggestion_delta","id":"s1","role":"cfo","role_label":"CFO","persona":"Betty","text":"Pregunta si"})
        );
        let c = EngineEvent::SuggestionCancel { id: "s1".into() };
        assert_eq!(c.tauri_event(), "suggestion_cancel");
        assert_eq!(serde_json::to_value(&c).unwrap(), serde_json::json!({"type":"suggestion_cancel","id":"s1"}));
    }

    /// La tarjeta aparece con el primer delta: esa es la hora que cuenta para fin del habla → tarjeta.
    #[test]
    fn stream_log_marks_the_first_delta_and_the_final_of_each_suggestion() {
        let mut log = StreamLog::default();
        assert_eq!(
            log.line(&delta("s1", "Pregunta si"), 1_000).as_deref(),
            Some("SOTTOLY_SUGGESTION_FIRST at_ms=1000 id=s1 role=cfo persona=Betty")
        );
        assert_eq!(log.line(&delta("s1", "Pregunta si incluye IVA."), 1_100), None);
        let final_ = EngineEvent::Suggestion(SuggestionMessage {
            id: "s1".into(),
            role: "cfo".into(),
            role_label: "CFO".into(),
            persona: "Betty".into(),
            text: "Pregunta si incluye IVA.".into(),
            reason: "Precio sin impuestos.".into(),
            confidence: 0.9,
        });
        assert_eq!(
            log.line(&final_, 1_200).as_deref(),
            Some("SOTTOLY_SUGGESTION at_ms=1200 id=s1 role=cfo persona=Betty text=\"Pregunta si incluye IVA.\"")
        );
        assert_eq!(log.line(&EngineEvent::SuggestionCancel { id: "s2".into() }, 1_300).as_deref(), Some("SOTTOLY_SUGGESTION_CANCEL at_ms=1300 id=s2"));
    }

    #[test]
    fn final_transcript_updates_become_segments_and_partials_do_not() {
        let update = |partial: bool| {
            format!(
                "{{\"text\":\"Son 18 millones.\",\"timestamp\":\"14:30:05\",\"source\":\"Audio\",\"sequence_id\":3,\
                 \"chunk_start_time\":7.2,\"is_partial\":{partial},\"confidence\":0.9,\"audio_start_time\":7.2,\
                 \"audio_end_time\":11.4,\"duration\":4.2,\"speaker\":\"counterpart\"}}"
            )
        };
        assert_eq!(
            segment_from_transcript(&update(false)),
            Some(EngineMessage::Segment { speaker: Speaker::Counterpart, text: "Son 18 millones.".into(), t0: 7.2, t1: 11.4 })
        );
        assert_eq!(segment_from_transcript(&update(true)), None);
    }

    /// Sidecar falso: deltas, final y cancelación llegan en orden; lo demás se ignora.
    #[test]
    fn bridge_reads_suggestion_events_in_order_and_skips_other_lines() {
        let mut fake = Command::new("sh");
        fake.arg("-c").arg(concat!(
            "read line; ",
            "echo 'no es json'; ",
            // SOTTOLY: antes esta línea era un `summary`; ahora el puente lo acepta (contrato, tarea 3).
            "echo '{\"type\":\"desconocido\",\"id\":\"x\"}'; ",
            "echo '{\"type\":\"suggestion_delta\",\"id\":\"s1\",\"role\":\"cfo\",\"role_label\":\"CFO\",\"persona\":\"Betty\",\"text\":\"Pregunta si\"}'; ",
            "echo '{\"type\":\"suggestion\",\"id\":\"s1\",\"role\":\"cfo\",\"role_label\":\"CFO\",\"persona\":\"Betty\",",
            "\"text\":\"Pregunta si incluye IVA.\",\"reason\":\"Precio sin impuestos.\",\"confidence\":0.9}'; ",
            "echo '{\"type\":\"suggestion_cancel\",\"id\":\"s2\"}'"
        ));
        let (tx, rx) = mpsc::channel();
        let bridge = EngineBridge::spawn(fake, move |e| tx.send(e).unwrap()).unwrap();
        bridge.send(&EngineMessage::Clock { t: 1.0 }).unwrap();
        bridge.finish().unwrap();

        let kinds: Vec<&str> = rx.try_iter().map(|e| e.tauri_event()).collect();
        assert_eq!(kinds, vec!["suggestion_delta", "suggestion", "suggestion_cancel"]);
    }

    #[derive(Deserialize)]
    struct Fixture {
        roles: Vec<String>,
        segments: Vec<FixtureSegment>,
    }

    #[derive(Deserialize)]
    struct FixtureSegment {
        speaker: Speaker,
        text: String,
        t0: f64,
        t1: f64,
    }

    /// Integración: el Motor real (`bun engine/src/main.ts`) con Jev y Haiku grabados.
    /// Una Reunión sintética entra por el puente y la Sugerencia de Betty sale por el callback.
    #[test]
    fn real_engine_with_recorded_providers_suggests_through_the_bridge() {
        let repo = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        let fixture: Fixture = serde_json::from_str(
            &std::fs::read_to_string(repo.join("evals/fixtures/contador-iva.json")).unwrap(),
        )
        .unwrap();

        let mut engine = Command::new("bun");
        engine.arg(repo.join("engine/src/main.ts")).env("SOTTOLY_PROVIDERS", "recorded");
        let (tx, rx) = mpsc::channel();
        let bridge = EngineBridge::spawn(engine, move |e| tx.send(e).unwrap()).expect("¿bun en el PATH?");

        bridge.send(&EngineMessage::Session { event: SessionEvent::Start, roles: Some(fixture.roles) }).unwrap();
        for s in fixture.segments {
            bridge.send(&EngineMessage::Segment { speaker: s.speaker, text: s.text, t0: s.t0, t1: s.t1 }).unwrap();
        }
        bridge.finish().unwrap();

        let events: Vec<EngineEvent> = rx.try_iter().collect();
        let got: Vec<&SuggestionMessage> =
            events.iter().filter_map(|e| if let EngineEvent::Suggestion(s) = e { Some(s) } else { None }).collect();
        assert_eq!(got.len(), 1, "{events:?}");
        assert_eq!(got[0].role, "cfo");
        assert_eq!(got[0].persona, "Betty");
        // Antes del final llegaron los deltas de la misma Sugerencia.
        assert!(matches!(&events[0], EngineEvent::SuggestionDelta(d) if d.id == got[0].id), "{events:?}");
    }

    #[test]
    fn clock_serializes_like_the_engine_protocol() {
        assert_eq!(EngineMessage::Clock { t: 131.2 }.to_line(), "{\"type\":\"clock\",\"t\":131.2}\n");
    }

    #[test]
    fn safe_time_follows_the_vad_when_nothing_is_in_flight() {
        let now = Instant::now();
        let mut c = clock();
        c.on_vad_progress(4.2, &[], now);
        assert_eq!(c.safe_time(now), 4.2);
    }

    /// Un Segmento que salió del VAD pero sigue en Parakeet frena el reloj en su inicio:
    /// si no, el Motor cerraría el Turno antes de recibirlo.
    #[test]
    fn a_segment_in_transcription_holds_the_clock_at_its_start() {
        let now = Instant::now();
        let mut c = clock();
        c.on_vad_progress(6.1, &[3.0], now);
        assert_eq!(c.safe_time(now), 3.0);

        c.on_segment_delivered(3.0);
        assert_eq!(c.safe_time(now), 6.1);
    }

    /// Parakeet descarta Segmentos sin texto y nunca llegan: el reloj no se queda trabado.
    #[test]
    fn a_segment_that_never_arrives_stops_holding_the_clock_after_the_timeout() {
        let start = Instant::now();
        let mut c = clock();
        c.on_vad_progress(6.1, &[3.0], start);
        assert_eq!(c.safe_time(start + Duration::from_millis(1_900)), 3.0);
        assert_eq!(c.safe_time(start + Duration::from_millis(2_100)), 6.1);
    }

    #[test]
    fn tick_sends_a_clock_only_when_time_advanced_by_the_interval() {
        let now = Instant::now();
        let mut c = clock();
        c.on_vad_progress(1.0, &[], now);
        assert_eq!(c.tick(now), Some(EngineMessage::Clock { t: 1.0 }));

        c.on_vad_progress(1.1, &[], now);
        assert_eq!(c.tick(now), None);

        c.on_vad_progress(1.3, &[], now);
        assert_eq!(c.tick(now), Some(EngineMessage::Clock { t: 1.3 }));
    }

    /// El Motor asume un reloj que no retrocede: si un Segmento en vuelo baja el tiempo seguro,
    /// no se manda un latido más viejo que el anterior.
    #[test]
    fn tick_never_goes_back_in_time() {
        let now = Instant::now();
        let mut c = clock();
        c.on_vad_progress(5.0, &[], now);
        assert!(c.tick(now).is_some());

        c.on_vad_progress(5.8, &[4.0], now);
        assert_eq!(c.tick(now), None);
    }
}

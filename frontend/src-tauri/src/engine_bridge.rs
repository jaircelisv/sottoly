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
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SessionEvent {
    Start,
    End,
}

/// Sugerencia del Motor (engine → app). Es también el payload del evento `suggestion` del overlay.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename = "suggestion")]
pub struct SuggestionMessage {
    pub role: String,
    pub persona: String,
    pub text: String,
    pub reason: String,
    pub confidence: f64,
}

/// Proceso del Motor con su stdin abierto. Cada Sugerencia que imprime llega a `on_suggestion`.
pub struct EngineBridge {
    child: Child,
    stdin: Mutex<Option<ChildStdin>>,
    reader: Option<JoinHandle<()>>,
}

impl EngineBridge {
    pub fn spawn(mut command: Command, on_suggestion: impl Fn(SuggestionMessage) + Send + 'static) -> std::io::Result<Self> {
        let mut child = command.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn()?;
        let stdout = child.stdout.take().expect("stdout piped");
        let stderr = child.stderr.take().expect("stderr piped");

        let reader = std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                match serde_json::from_str::<SuggestionMessage>(&line) {
                    Ok(suggestion) => on_suggestion(suggestion),
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

/// Evento de Tauri con cada Sugerencia (lo escucha el overlay).
pub const SUGGESTION_EVENT: &str = "suggestion";

/// Línea de log por Sugerencia emitida (medición fin del habla → tarjeta, como SOTTOLY_LATENCY).
fn suggestion_log_line(s: &SuggestionMessage, unix_ms: u128) -> String {
    format!("SOTTOLY_SUGGESTION at_ms={} role={} persona={} text={:?}", unix_ms, s.role, s.persona, s.text)
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

fn start_session<R: tauri::Runtime>(app: tauri::AppHandle<R>) {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use tauri::Emitter;

    stop_session();
    let emitter = app.clone();
    let bridge = match EngineBridge::spawn(engine_command(), move |s| {
        let now_ms = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
        info!("{}", suggestion_log_line(&s, now_ms));
        if let Err(e) = emitter.emit(SUGGESTION_EVENT, &s) {
            warn!("SOTTOLY: no se pudo emitir la Sugerencia: {}", e);
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

    fn clock() -> EngineClock {
        EngineClock::new(0.25, Duration::from_secs(2))
    }

    use std::sync::mpsc;

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
        let line = r#"{"type":"suggestion","role":"cfo","role_label":"CFO","persona":"Betty","text":"Pregunta si incluye IVA.","reason":"Precio sin impuestos.","confidence":0.9}"#;
        let s: SuggestionMessage = serde_json::from_str(line).unwrap();
        let out = serde_json::to_value(&s).unwrap();
        assert_eq!(out["role_label"], "CFO");
    }

    #[test]
    fn suggestion_log_line_has_the_emission_time_in_ms() {
        let s = SuggestionMessage {
            role: "cfo".into(),
            persona: "Betty".into(),
            text: "Pregunta si incluye IVA.".into(),
            reason: "Precio sin impuestos.".into(),
            confidence: 0.9,
        };
        assert_eq!(
            suggestion_log_line(&s, 1_759_465_000_123),
            "SOTTOLY_SUGGESTION at_ms=1759465000123 role=cfo persona=Betty text=\"Pregunta si incluye IVA.\""
        );
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

    /// Sidecar falso: lo que no es una Sugerencia válida se ignora sin tumbar el puente.
    #[test]
    fn bridge_reads_suggestions_and_skips_other_lines() {
        let mut fake = Command::new("sh");
        fake.arg("-c").arg(concat!(
            "read line; ",
            "echo 'no es json'; ",
            "echo '{\"type\":\"summary\",\"decisions\":[]}'; ",
            "echo '{\"type\":\"suggestion\",\"role\":\"cfo\",\"persona\":\"Betty\",",
            "\"text\":\"Pregunta si incluye IVA.\",\"reason\":\"Precio sin impuestos.\",\"confidence\":0.9}'"
        ));
        let (tx, rx) = mpsc::channel();
        let bridge = EngineBridge::spawn(fake, move |s| tx.send(s).unwrap()).unwrap();
        bridge.send(&EngineMessage::Clock { t: 1.0 }).unwrap();
        bridge.finish().unwrap();

        let got: Vec<SuggestionMessage> = rx.try_iter().collect();
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].persona, "Betty");
        assert_eq!(got[0].text, "Pregunta si incluye IVA.");
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

    /// Integración: el Motor real (`bun engine/src/main.ts`) con Jev y Sonnet grabados.
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
        let bridge = EngineBridge::spawn(engine, move |s| tx.send(s).unwrap()).expect("¿bun en el PATH?");

        bridge.send(&EngineMessage::Session { event: SessionEvent::Start, roles: Some(fixture.roles) }).unwrap();
        for s in fixture.segments {
            bridge.send(&EngineMessage::Segment { speaker: s.speaker, text: s.text, t0: s.t0, t1: s.t1 }).unwrap();
        }
        bridge.finish().unwrap();

        let got: Vec<SuggestionMessage> = rx.try_iter().collect();
        assert_eq!(got.len(), 1, "{got:?}");
        assert_eq!(got[0].role, "cfo");
        assert_eq!(got[0].persona, "Betty");
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

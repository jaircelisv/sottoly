// SOTTOLY: puente App ↔ Motor (SPEC §4). Archivo nuevo para no tocar Meetily (ADR-0001).
// Habla con el sidecar `sottoly-engine` por stdin/stdout, una línea JSON por mensaje.

use std::process::Command;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::audio::speaker::Speaker;

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
pub struct EngineBridge;

impl EngineBridge {
    pub fn spawn(command: Command, on_suggestion: impl Fn(SuggestionMessage) + Send + 'static) -> std::io::Result<Self> {
        let _ = (command, on_suggestion);
        unimplemented!()
    }

    pub fn send(&self, message: &EngineMessage) -> std::io::Result<()> {
        let _ = message;
        unimplemented!()
    }

    /// Cierra el stdin (el Motor cierra la Reunión y sale) y espera a que termine.
    pub fn finish(self) -> std::io::Result<()> {
        unimplemented!()
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
    let mut guard = CLOCK.lock().unwrap_or_else(|e| e.into_inner());
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
    *CLOCK.lock().unwrap_or_else(|e| e.into_inner()) = None;
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

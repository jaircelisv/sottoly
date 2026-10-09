// SOTTOLY: el lado de Rust del contrato App ↔ Motor (gate/reglas/integridad-del-protocolo.json).
//   cargo run --example contract -- outbound   lee mensajes del Motor por stdin (JSONL) y responde
//                                              {"rust":true} o {"rust":false,"error":"…"} por línea,
//                                              deserializando con el mismo EngineEvent del puente.
//   cargo run --example contract -- inbound    imprime los mensajes que Rust produce hacia el Motor.
use app_lib::audio::speaker::Speaker;
use app_lib::engine_bridge::{EngineEvent, EngineMessage, SessionEvent, SessionMode};
use std::io::BufRead;

fn main() {
    match std::env::args().nth(1).as_deref() {
        Some("outbound") => {
            for line in std::io::stdin().lock().lines() {
                let line = line.expect("stdin");
                if line.trim().is_empty() {
                    continue;
                }
                let out = match serde_json::from_str::<EngineEvent>(&line) {
                    Ok(_) => serde_json::json!({ "rust": true }),
                    Err(e) => serde_json::json!({ "rust": false, "error": e.to_string() }),
                };
                println!("{out}");
            }
        }
        Some("inbound") => {
            let mensajes = [
                EngineMessage::Segment { speaker: Speaker::User, text: "¿Incluye soporte?".into(), t0: 1.0, t1: 2.5 },
                EngineMessage::Segment { speaker: Speaker::Counterpart, text: "Son dos millones.".into(), t0: 3.0, t1: 4.2 },
                EngineMessage::Segment { speaker: Speaker::Mixed, text: "Listo.".into(), t0: 5.0, t1: 5.4 },
                EngineMessage::Session { event: SessionEvent::Start, roles: Some(vec!["cfo".into(), "ceo".into()]), mode: None },
                EngineMessage::Session { event: SessionEvent::End, roles: None, mode: None },
                EngineMessage::Session { event: SessionEvent::Start, roles: Some(vec!["cfo".into()]), mode: Some(SessionMode::Review) },
                EngineMessage::Clock { t: 6.1 },
                EngineMessage::Chat { id: "c-1".into(), role: "cfo".into(), text: "¿Qué dijo del anticipo?".into(), reply_to: None },
                EngineMessage::Chat { id: "c-2".into(), role: "cfo".into(), text: "¿Y si el IVA va aparte?".into(), reply_to: Some("s1".into()) },
            ];
            for m in mensajes {
                println!("{}", serde_json::to_string(&m).unwrap());
            }
        }
        _ => {
            eprintln!("uso: cargo run --example contract -- outbound|inbound");
            std::process::exit(2);
        }
    }
}

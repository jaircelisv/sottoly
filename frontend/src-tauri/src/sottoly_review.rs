// SOTTOLY: archivo nuevo. Hablar con la junta después de la Reunión (PLAN.md, tarea 29).
//
// El detalle de una Reunión terminada abre una sesión del Motor en modo `review`: le pasa la transcripción
// guardada (sin Compuerta ni `summary`) y luego cada pregunta del chat. Las respuestas salen por los mismos
// eventos del chat en vivo (`chat_delta`, `chat_reply`, `chat_error`). Una sola sesión de revisión a la vez.
use crate::audio::speaker::Speaker;
use crate::engine_bridge::{engine_command, EngineBridge, EngineEvent, EngineMessage, SessionEvent, SessionMode};
use log::warn;
use std::sync::{Arc, Mutex};

struct Review {
    meeting_id: String,
    bridge: Arc<EngineBridge>,
}

static REVIEW: Mutex<Option<Review>> = Mutex::new(None);

/// Una frase guardada de la Reunión: quién habló (como lo guarda la tarea 15), el texto y su momento.
pub struct SavedLine {
    pub speaker: Option<String>,
    pub text: String,
    pub t0: f64,
    pub t1: f64,
}

fn speaker(s: Option<&str>) -> Speaker {
    match s {
        Some("user") | Some("mic") => Speaker::User,
        Some("counterpart") | Some("system") => Speaker::Counterpart,
        _ => Speaker::Mixed,
    }
}

/// Lo que se le manda al Motor para cargar una Reunión terminada: el inicio en modo `review` y sus frases.
pub fn review_messages(lines: &[SavedLine]) -> Vec<EngineMessage> {
    let mut out = vec![EngineMessage::Session { event: SessionEvent::Start, roles: None, mode: Some(SessionMode::Review) }];
    for l in lines.iter().filter(|l| !l.text.trim().is_empty()) {
        out.push(EngineMessage::Segment { speaker: speaker(l.speaker.as_deref()), text: l.text.clone(), t0: l.t0, t1: l.t1.max(l.t0) });
    }
    out
}

async fn saved_lines(state: &crate::state::AppState, meeting_id: &str) -> Result<Vec<SavedLine>, String> {
    let rows = sqlx::query_as::<_, (String, Option<f64>, Option<f64>, Option<String>)>(
        "SELECT transcript, audio_start_time, audio_end_time, speaker FROM transcripts WHERE meeting_id = ? ORDER BY audio_start_time, timestamp",
    )
    .bind(meeting_id)
    .fetch_all(state.db_manager.pool())
    .await
    .map_err(|e| e.to_string())?;
    Ok(rows
        .into_iter()
        .map(|(text, t0, t1, speaker)| {
            let t0 = t0.unwrap_or(0.0);
            SavedLine { speaker, text, t0, t1: t1.unwrap_or(t0) }
        })
        .collect())
}

/// Le pregunta a un Rol sobre una Reunión terminada. Devuelve el id con el que llegará la respuesta.
#[tauri::command]
pub async fn sottoly_review_chat_send<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    meeting_id: String,
    role: String,
    text: String,
    state: tauri::State<'_, crate::state::AppState>,
) -> Result<String, String> {
    use tauri::Emitter;
    let current = REVIEW.lock().unwrap_or_else(|e| e.into_inner()).as_ref().filter(|r| r.meeting_id == meeting_id).map(|r| r.bridge.clone());
    let bridge = match current {
        Some(b) => b,
        None => {
            let lines = saved_lines(&state, &meeting_id).await?;
            let emitter = app.clone();
            let bridge = EngineBridge::spawn(engine_command(), move |event| {
                // Solo el chat: en revisión el Motor no manda Sugerencias ni `summary`.
                if matches!(event, EngineEvent::ChatDelta { .. } | EngineEvent::ChatReply { .. } | EngineEvent::ChatError { .. }) {
                    if let Err(e) = emitter.emit(event.tauri_event(), &event) {
                        warn!("SOTTOLY: no se pudo emitir {}: {}", event.tauri_event(), e);
                    }
                }
            })
            .map_err(|e| format!("No arrancó el Motor: {e}"))?;
            for m in review_messages(&lines) {
                bridge.send(&m).map_err(|e| format!("No se pudo cargar la Reunión en el Motor: {e}"))?;
            }
            let bridge = Arc::new(bridge);
            let previous = REVIEW.lock().unwrap_or_else(|e| e.into_inner()).replace(Review { meeting_id: meeting_id.clone(), bridge: bridge.clone() });
            if let Some(previous) = previous {
                if let Ok(b) = Arc::try_unwrap(previous.bridge) {
                    std::thread::spawn(move || {
                        let _ = b.finish();
                    });
                }
            }
            bridge
        }
    };
    let id = format!("r-{}", uuid::Uuid::new_v4());
    bridge
        .send(&EngineMessage::Chat { id: id.clone(), role, text, reply_to: None })
        .map_err(|e| format!("No se pudo hablar con el Motor: {e}"))?;
    Ok(id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn la_reunion_se_carga_en_modo_review_con_quien_hablo_y_sin_frases_vacias() {
        let lines = vec![
            SavedLine { speaker: Some("counterpart".into()), text: "Son dieciocho millones.".into(), t0: 1.0, t1: 3.0 },
            SavedLine { speaker: Some("mic".into()), text: "¿Con IVA?".into(), t0: 4.0, t1: 5.0 },
            SavedLine { speaker: None, text: "  ".into(), t0: 6.0, t1: 6.5 },
        ];
        let lineas: Vec<String> = review_messages(&lines).iter().map(|m| m.to_line()).collect();
        assert_eq!(
            lineas,
            vec![
                "{\"type\":\"session\",\"event\":\"start\",\"mode\":\"review\"}\n".to_string(),
                "{\"type\":\"segment\",\"speaker\":\"counterpart\",\"text\":\"Son dieciocho millones.\",\"t0\":1.0,\"t1\":3.0}\n".to_string(),
                "{\"type\":\"segment\",\"speaker\":\"user\",\"text\":\"¿Con IVA?\",\"t0\":4.0,\"t1\":5.0}\n".to_string(),
            ]
        );
    }
}

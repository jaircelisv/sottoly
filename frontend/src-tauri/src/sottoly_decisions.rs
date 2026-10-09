// SOTTOLY: archivo nuevo. Decisiones del cierre (PLAN.md, tarea 17; SPEC §6).
//
// El `summary` que manda el Motor al cerrar se guarda en la carpeta de la Reunión (la de Meetily,
// `meetings.folder_path`) como `sottoly-decisions.json`. El Usuario aprueba, edita o descarta cada una en el
// panel; lo aprobado va a la Memoria: un Markdown por Reunión en `~/.sottoly/memory/`.
use crate::engine_bridge::{Decision, DecisionKind, DecisionOwner};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

const FILE: &str = "sottoly-decisions.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DecisionsFile {
    /// true cuando el Usuario ya decidió (aprobó algo o eligió no guardar nada).
    pub reviewed: bool,
    pub decisions: Vec<Decision>,
}

/// Lo que eligió el Usuario para una Decisión: si se guarda y con qué texto (puede venir editado).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ReviewItem {
    pub id: String,
    pub approved: bool,
    pub text: String,
}

/// Guarda las Decisiones candidatas con la Reunión. Sin candidatas no hay nada que revisar.
pub fn store_summary(folder: &Path, decisions: &[Decision]) -> Result<(), String> {
    let file = DecisionsFile { reviewed: decisions.is_empty(), decisions: decisions.to_vec() };
    write(folder, &file)
}

pub fn load_decisions(folder: &Path) -> Option<DecisionsFile> {
    serde_json::from_str(&std::fs::read_to_string(folder.join(FILE)).ok()?).ok()
}

fn write(folder: &Path, file: &DecisionsFile) -> Result<(), String> {
    std::fs::create_dir_all(folder).map_err(|e| format!("No se pudo crear la carpeta de la Reunión: {e}"))?;
    let json = serde_json::to_string_pretty(file).map_err(|e| e.to_string())?;
    std::fs::write(folder.join(FILE), json).map_err(|e| format!("No se pudieron guardar las Decisiones: {e}"))
}

fn owner_label(o: DecisionOwner) -> &'static str {
    match o {
        DecisionOwner::User => "Tú",
        DecisionOwner::Counterpart => "Contraparte",
    }
}

fn slug(title: &str) -> String {
    let s: String = title
        .to_lowercase()
        .chars()
        .map(|c| match c {
            'á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ñ' => 'n',
            c if c.is_ascii_alphanumeric() => c,
            _ => '-',
        })
        .collect();
    s.split('-').filter(|p| !p.is_empty()).collect::<Vec<_>>().join("-")
}

/// Aplica lo que eligió el Usuario. Lo aprobado (con su texto) va a la Memoria; si no aprobó nada, no se
/// escribe nada en la Memoria. En los dos casos la Reunión queda revisada. Devuelve cuántas se guardaron.
pub fn review_decisions(folder: &Path, memory_dir: &Path, title: &str, created_at: &str, items: &[ReviewItem]) -> Result<usize, String> {
    let mut file = load_decisions(folder).ok_or("Esta Reunión no tiene Decisiones por revisar.")?;
    for d in file.decisions.iter_mut() {
        match items.iter().find(|i| i.id == d.id) {
            Some(item) => {
                d.approved = item.approved;
                if item.approved && !item.text.trim().is_empty() {
                    d.text = item.text.trim().to_string();
                }
            }
            None => d.approved = false,
        }
    }
    let approved: Vec<&Decision> = file.decisions.iter().filter(|d| d.approved).collect();
    if !approved.is_empty() {
        let date = created_at.get(..10).unwrap_or(created_at);
        let line = |d: &Decision| match &d.due {
            Some(due) => format!("- {} ({}, para el {})", d.text, owner_label(d.owner), due),
            None => format!("- {} ({})", d.text, owner_label(d.owner)),
        };
        let section = |kind: DecisionKind, heading: &str| {
            let lines: Vec<String> = approved.iter().filter(|d| d.kind == kind).map(|d| line(d)).collect();
            if lines.is_empty() { String::new() } else { format!("\n## {heading}\n\n{}\n", lines.join("\n")) }
        };
        let md = format!(
            "# {title}\n\nFecha: {date}\n{}{}",
            section(DecisionKind::Decision, "Decisiones"),
            section(DecisionKind::Commitment, "Compromisos")
        );
        std::fs::create_dir_all(memory_dir).map_err(|e| format!("No se pudo crear la Memoria: {e}"))?;
        let name = format!("{date}-{}.md", slug(title));
        std::fs::write(memory_dir.join(name), md).map_err(|e| format!("No se pudo escribir en la Memoria: {e}"))?;
    }
    file.reviewed = true;
    write(folder, &file)?;
    Ok(approved.len())
}

/// `~/.sottoly/memory/` (SPEC §6).
pub fn memory_dir() -> PathBuf {
    dirs::home_dir().unwrap_or_default().join(".sottoly").join("memory")
}

pub(crate) async fn meeting_row(state: &crate::state::AppState, meeting_id: &str) -> Result<(String, String, Option<String>), String> {
    sqlx::query_as::<_, (String, String, Option<String>)>("SELECT title, created_at, folder_path FROM meetings WHERE id = ?")
        .bind(meeting_id)
        .fetch_optional(state.db_manager.pool())
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No se encontró la Reunión.".to_string())
}

#[tauri::command]
pub async fn sottoly_get_decisions(meeting_id: String, state: tauri::State<'_, crate::state::AppState>) -> Result<Option<DecisionsFile>, String> {
    let (_, _, folder) = meeting_row(&state, &meeting_id).await?;
    Ok(folder.and_then(|f| load_decisions(Path::new(&f))))
}

#[derive(Serialize)]
pub struct SaveResult {
    pub saved: usize,
}

#[tauri::command]
pub async fn sottoly_save_decisions(meeting_id: String, items: Vec<ReviewItem>, state: tauri::State<'_, crate::state::AppState>) -> Result<SaveResult, String> {
    let (title, created_at, folder) = meeting_row(&state, &meeting_id).await?;
    let folder = folder.ok_or("Esta Reunión no tiene carpeta.")?;
    let saved = review_decisions(Path::new(&folder), &memory_dir(), &title, &created_at, &items)?;
    Ok(SaveResult { saved })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine_bridge::DecisionSource;

    fn d(id: &str, kind: DecisionKind, owner: DecisionOwner, text: &str) -> Decision {
        Decision { id: id.into(), kind, text: text.into(), owner, due: None, source: DecisionSource::Engine, meeting_id: "m".into(), created_at: "2026-10-07T22:00:00Z".into(), approved: false }
    }

    #[test]
    fn sin_candidatas_no_hay_nada_que_revisar() {
        let dir = tempfile::tempdir().unwrap();
        store_summary(dir.path(), &[]).unwrap();
        assert!(load_decisions(dir.path()).unwrap().reviewed);
    }

    #[test]
    fn una_decision_que_no_vino_en_la_revision_no_se_guarda() {
        let (dir, mem) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        store_summary(dir.path(), &[d("a", DecisionKind::Decision, DecisionOwner::User, "Uno."), d("b", DecisionKind::Decision, DecisionOwner::User, "Dos.")]).unwrap();
        let n = review_decisions(dir.path(), mem.path(), "Reunión: socios", "2026-10-07T22:00:00Z", &[ReviewItem { id: "a".into(), approved: true, text: "Uno.".into() }]).unwrap();
        assert_eq!(n, 1);
        let file = std::fs::read_dir(mem.path()).unwrap().next().unwrap().unwrap().path();
        assert_eq!(file.file_name().unwrap().to_str().unwrap(), "2026-10-07-reunion-socios.md");
        assert!(!std::fs::read_to_string(file).unwrap().contains("Dos."));
    }
}

// SOTTOLY: archivo nuevo. Sugerencias de la junta guardadas con la Reunión (PLAN.md, tarea 27).
//
// Al detener la grabación, el panel guarda las Sugerencias que vio, con su momento en el audio y la marca
// Útil / No útil que les dio el Usuario, en la carpeta de la Reunión como `sottoly-suggestions.json`.
// El detalle de la Reunión las muestra en la transcripción.
use serde::{Deserialize, Serialize};
use std::path::Path;

const FILE: &str = "sottoly-suggestions.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SavedSuggestion {
    pub id: String,
    pub role: String,
    pub persona: String,
    pub role_label: String,
    pub text: String,
    pub reason: String,
    /// Segundos desde el inicio del audio, si se sabe.
    pub at: Option<f64>,
    /// La marca del Usuario: Útil (true), No útil (false) o ninguna.
    pub useful: Option<bool>,
}

pub fn store_suggestions(folder: &Path, suggestions: &[SavedSuggestion]) -> Result<(), String> {
    std::fs::create_dir_all(folder).map_err(|e| format!("No se pudo crear la carpeta de la Reunión: {e}"))?;
    let json = serde_json::to_string_pretty(suggestions).map_err(|e| e.to_string())?;
    std::fs::write(folder.join(FILE), json).map_err(|e| format!("No se pudieron guardar las Sugerencias: {e}"))
}

pub fn load_suggestions(folder: &Path) -> Vec<SavedSuggestion> {
    std::fs::read_to_string(folder.join(FILE))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

#[tauri::command]
pub async fn sottoly_save_suggestions(folder_path: String, suggestions: Vec<SavedSuggestion>) -> Result<(), String> {
    store_suggestions(Path::new(&folder_path), &suggestions)
}

#[tauri::command]
pub async fn sottoly_get_suggestions(meeting_id: String, state: tauri::State<'_, crate::state::AppState>) -> Result<Vec<SavedSuggestion>, String> {
    let (_, _, folder) = crate::sottoly_decisions::meeting_row(&state, &meeting_id).await?;
    Ok(folder.map(|f| load_suggestions(Path::new(&f))).unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(id: &str, at: Option<f64>, useful: Option<bool>) -> SavedSuggestion {
        SavedSuggestion {
            id: id.into(),
            role: "cfo".into(),
            persona: "Betty".into(),
            role_label: "CFO".into(),
            text: "Pregunta si incluye IVA.".into(),
            reason: "Precio sin impuestos.".into(),
            at,
            useful,
        }
    }

    #[test]
    fn las_sugerencias_se_guardan_y_se_leen_con_su_momento_y_su_marca() {
        let dir = tempfile::tempdir().unwrap();
        let todas = vec![s("s1", Some(12.5), Some(true)), s("s2", None, None)];
        store_suggestions(dir.path(), &todas).unwrap();
        assert_eq!(load_suggestions(dir.path()), todas);
    }

    #[test]
    fn una_reunion_sin_sugerencias_guardadas_no_tiene_ninguna() {
        let dir = tempfile::tempdir().unwrap();
        assert!(load_suggestions(dir.path()).is_empty());
    }
}

// SOTTOLY: archivo nuevo. Cuánto interviene cada Rol (PLAN.md, tarea 30).
//
// El Usuario elige en Roles un nivel por Rol: `important` (el umbral calibrado), `balanced` u `often`. Se guarda
// fuera del Rol, en ~/.sottoly/role-levels.json, y el Motor lo lee al empezar cada Reunión. El archivo del Rol
// (`gate_option`, `gate_definition`, `calibrated_with`) no cambia.
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

const LEVELS: [&str; 3] = ["important", "balanced", "often"];

pub fn levels_file() -> PathBuf {
    dirs::home_dir().unwrap_or_default().join(".sottoly").join("role-levels.json")
}

pub fn load_levels(file: &Path) -> BTreeMap<String, String> {
    std::fs::read_to_string(file).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
}

pub fn set_level(file: &Path, role: &str, level: &str) -> Result<(), String> {
    if !LEVELS.contains(&level) {
        return Err(format!("Nivel desconocido: {level}"));
    }
    if role.trim().is_empty() {
        return Err("Falta el Rol.".into());
    }
    let mut levels = load_levels(file);
    levels.insert(role.to_string(), level.to_string());
    if let Some(dir) = file.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&levels).map_err(|e| e.to_string())?;
    std::fs::write(file, json).map_err(|e| format!("No se pudo guardar el nivel: {e}"))
}

#[tauri::command]
pub async fn sottoly_get_role_levels() -> Result<BTreeMap<String, String>, String> {
    Ok(load_levels(&levels_file()))
}

#[tauri::command]
pub async fn sottoly_set_role_level(role: String, level: String) -> Result<(), String> {
    set_level(&levels_file(), &role, &level)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn el_nivel_se_guarda_por_rol_y_se_lee() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("role-levels.json");
        assert!(load_levels(&file).is_empty());
        set_level(&file, "cfo", "often").unwrap();
        set_level(&file, "ceo", "balanced").unwrap();
        set_level(&file, "cfo", "important").unwrap();
        let levels = load_levels(&file);
        assert_eq!(levels.get("cfo").map(String::as_str), Some("important"));
        assert_eq!(levels.get("ceo").map(String::as_str), Some("balanced"));
    }

    #[test]
    fn un_nivel_desconocido_no_se_guarda() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("role-levels.json");
        assert!(set_level(&file, "cfo", "siempre").is_err());
        assert!(load_levels(&file).is_empty());
    }
}

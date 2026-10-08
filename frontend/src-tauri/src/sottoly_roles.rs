// SOTTOLY: archivo nuevo. Los Roles de roles/ para el panel (PLAN.md, tarea 12).
//
// Lee el frontmatter de cada roles/*.md (el mismo que carga el Motor en engine/src/roles.ts) y devuelve
// lo que muestra la pantalla Roles. Solo lectura: activar Roles y crearlos llega en tareas siguientes.
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct RoleSummary {
    /// Nombre del archivo sin `.md` (el id que usa el Motor).
    pub id: String,
    pub role: String,
    pub persona: String,
    pub gate_definition: String,
    /// `calibrated_with` distinto de `none`.
    pub calibrated: bool,
    pub status: String,
}

/// Carpeta de Roles: `SOTTOLY_ROLES_DIR` si está; si no, roles/ del repo (igual que el puente con el Motor).
pub fn roles_dir() -> PathBuf {
    std::env::var_os("SOTTOLY_ROLES_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/../../roles")))
}

/// Valor de una clave `clave: valor` del frontmatter (sin comillas alrededor).
fn field<'a>(frontmatter: &'a str, key: &str) -> Option<&'a str> {
    frontmatter.lines().find_map(|line| {
        let (k, v) = line.split_once(':')?;
        (k.trim() == key).then(|| v.trim().trim_matches('"'))
    })
}

/// Un Rol a partir del texto de su archivo; None si no tiene frontmatter o le faltan campos.
pub fn parse_role(id: &str, text: &str) -> Option<RoleSummary> {
    let rest = text.strip_prefix("---")?;
    let end = rest.find("\n---")?;
    let fm = &rest[..end];
    Some(RoleSummary {
        id: id.to_string(),
        role: field(fm, "role")?.to_string(),
        persona: field(fm, "persona")?.to_string(),
        gate_definition: field(fm, "gate_definition").unwrap_or("").to_string(),
        calibrated: field(fm, "calibrated_with").map(|v| v != "none" && !v.is_empty()).unwrap_or(false),
        status: field(fm, "status").unwrap_or("active").to_string(),
    })
}

/// Todos los Roles de `dir`, ordenados por id. Los archivos que no se pueden leer se saltan.
pub fn load_roles(dir: &Path) -> Result<Vec<RoleSummary>, String> {
    let entries = std::fs::read_dir(dir).map_err(|e| format!("no se pudo leer {}: {}", dir.display(), e))?;
    let mut roles: Vec<RoleSummary> = entries
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|x| x.to_str()) == Some("md"))
        .filter_map(|p| {
            let id = p.file_stem()?.to_str()?.to_string();
            parse_role(&id, &std::fs::read_to_string(&p).ok()?)
        })
        .collect();
    roles.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(roles)
}

#[tauri::command]
pub async fn sottoly_list_roles() -> Result<Vec<RoleSummary>, String> {
    load_roles(&roles_dir())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lee_el_frontmatter_de_un_rol() {
        let text = "---\nrole: CFO\npersona: Betty\ngate_definition: Interviene cuando se mencionan cifras.\ncalibrated_with: none\nstatus: active\n---\nEres la directora financiera.";
        assert_eq!(
            parse_role("cfo", text),
            Some(RoleSummary {
                id: "cfo".into(),
                role: "CFO".into(),
                persona: "Betty".into(),
                gate_definition: "Interviene cuando se mencionan cifras.".into(),
                calibrated: false,
                status: "active".into(),
            })
        );
    }

    #[test]
    fn calibrado_cuando_calibrated_with_nombra_algo() {
        let text = "---\nrole: CEO\npersona: Sheldon\ncalibrated_with: evals-2026-10-07\n---\n";
        assert!(parse_role("ceo", text).unwrap().calibrated);
    }

    #[test]
    fn sin_frontmatter_o_sin_persona_no_es_un_rol() {
        assert_eq!(parse_role("x", "# notas"), None);
        assert_eq!(parse_role("x", "---\nrole: CFO\n---\n"), None);
    }

    #[test]
    fn los_roles_del_repo_cargan_y_ninguno_esta_calibrado_todavia() {
        let roles = load_roles(&roles_dir()).unwrap();
        assert!(roles.iter().any(|r| r.id == "cfo" && r.persona == "Betty"));
        assert!(roles.iter().all(|r| !r.calibrated));
    }
}

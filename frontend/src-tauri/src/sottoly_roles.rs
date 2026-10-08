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

/// Valor de una clave `clave: valor` del frontmatter. Entre comillas dobles se lee con sus escapes
/// (los que escribe el creador: \" \\ \n, iguales en YAML y en JSON).
fn field(frontmatter: &str, key: &str) -> Option<String> {
    frontmatter.lines().find_map(|line| {
        let (k, v) = line.split_once(':')?;
        if k.trim() != key {
            return None;
        }
        let v = v.trim();
        if v.starts_with('"') {
            serde_json::from_str::<String>(v).ok()
        } else {
            Some(v.to_string())
        }
    })
}

/// Un Rol a partir del texto de su archivo; None si no tiene frontmatter o le faltan campos.
pub fn parse_role(id: &str, text: &str) -> Option<RoleSummary> {
    let rest = text.strip_prefix("---")?;
    let end = rest.find("\n---")?;
    let fm = &rest[..end];
    Some(RoleSummary {
        id: id.to_string(),
        role: field(fm, "role")?,
        persona: field(fm, "persona")?,
        gate_definition: field(fm, "gate_definition").unwrap_or_default(),
        calibrated: field(fm, "calibrated_with").map(|v| v != "none" && !v.is_empty()).unwrap_or(false),
        status: field(fm, "status").unwrap_or_else(|| "active".into()),
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

// --- Creador de Roles (PLAN.md, tarea 14) ----------------------------------------------------------

/// Lo que responde el Usuario en la entrevista del creador.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct RoleDraft {
    pub name: String,
    pub persona: String,
    pub function: String,
    #[serde(default)]
    pub tone: String,
    pub when: String,
    #[serde(default)]
    pub example_speak: String,
    #[serde(default)]
    pub example_silent: String,
    #[serde(default)]
    pub limits: Vec<String>,
}

/// Umbral de un Rol recién creado: alto, para que hable poco hasta calibrarlo.
pub const NEW_ROLE_THRESHOLD: f64 = 0.9;
/// Límites que conoce el Motor (categorías en inglés, ver draft.ts).
const KNOWN_LIMITS: [&str; 3] = ["legal opinions", "personal topics", "personal attacks"];

/// Id del Rol a partir de su nombre: minúsculas, sin tildes, snake_case, empieza por letra.
pub fn role_id(name: &str) -> String {
    let mut out = String::new();
    for c in name.trim().to_lowercase().chars() {
        let c = match c {
            'á' | 'à' | 'ä' => 'a',
            'é' | 'è' | 'ë' => 'e',
            'í' | 'ì' | 'ï' => 'i',
            'ó' | 'ò' | 'ö' => 'o',
            'ú' | 'ù' | 'ü' => 'u',
            'ñ' => 'n',
            c => c,
        };
        if c.is_ascii_alphanumeric() {
            out.push(c);
        } else if !out.ends_with('_') {
            out.push('_');
        }
    }
    let out = out.trim_matches('_').to_string();
    if out.starts_with(|c: char| c.is_ascii_lowercase()) { out } else { format!("rol_{out}") }
}

/// Cadena YAML entre comillas dobles: comillas, barras y saltos de línea escapados.
fn yaml_str(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\"").replace('\n', "\\n").replace('\r', ""))
}

/// Escribe `roles/<id>.md` (y `<id>.examples.json`) y devuelve el Rol como lo lista el panel.
pub fn create_role(dir: &Path, draft: RoleDraft) -> Result<RoleSummary, String> {
    let name = draft.name.trim();
    let persona = draft.persona.trim();
    let function = draft.function.trim();
    let when = draft.when.trim();
    if function.is_empty() {
        return Err("Falta decir qué va a cuidar el Rol.".into());
    }
    if persona.is_empty() {
        return Err("Falta el nombre de la persona.".into());
    }
    if when.is_empty() {
        return Err("Falta decir cuándo interviene el Rol.".into());
    }
    if name.is_empty() {
        return Err("Falta el nombre del Rol.".into());
    }
    let id = role_id(name);
    let existing = load_roles(dir)?;
    if dir.join(format!("{id}.md")).exists()
        || existing.iter().any(|r| r.id == id || r.role.eq_ignore_ascii_case(name))
    {
        return Err(format!("Ya existe un Rol llamado {name}."));
    }
    let limits: Vec<&str> = draft.limits.iter().map(|l| l.as_str()).filter(|l| KNOWN_LIMITS.contains(l)).collect();
    let tone = draft.tone.trim();
    let instructions = if tone.is_empty() {
        format!("Eres {persona}, {name} de la junta asesora del Usuario. {function}")
    } else {
        format!("Eres {persona}, {name} de la junta asesora del Usuario. {function}\n\nCómo hablas: {tone}")
    };
    let file = format!(
        "---\nrole: {}\npersona: {}\nobjective: {}\ngate_option: {id}\ngate_definition: {}\nlimits: [{}]\nsources: []\nthreshold: {NEW_ROLE_THRESHOLD}\ncalibrated_with: none\nstatus: active\n---\n{instructions}\n",
        yaml_str(name),
        yaml_str(persona),
        yaml_str(function),
        yaml_str(when),
        limits.join(", "),
    );
    std::fs::write(dir.join(format!("{id}.md")), file).map_err(|e| format!("No se pudo guardar el Rol: {e}"))?;
    let one = |s: &str| if s.trim().is_empty() { vec![] } else { vec![s.trim().to_string()] };
    let (speak, silent) = (one(&draft.example_speak), one(&draft.example_silent));
    let examples = serde_json::json!({ "speak": speak, "silent": silent });
    std::fs::write(dir.join(format!("{id}.examples.json")), serde_json::to_string_pretty(&examples).unwrap())
        .map_err(|e| format!("No se pudieron guardar los ejemplos: {e}"))?;
    Ok(RoleSummary {
        id,
        role: name.to_string(),
        persona: persona.to_string(),
        gate_definition: when.to_string(),
        calibrated: false,
        status: "active".into(),
    })
}

#[tauri::command]
pub async fn sottoly_create_role(draft: RoleDraft) -> Result<RoleSummary, String> {
    create_role(&roles_dir(), draft)
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

    fn borrador(name: &str) -> RoleDraft {
        RoleDraft {
            name: name.into(),
            persona: "Max \"el duro\"".into(),
            function: "Que avise de descuentos sin contraprestación.".into(),
            tone: "Seco: va al grano.".into(),
            when: "Interviene cuando dicen: \"esto es final\"\no aceptan sin datos.".into(),
            example_speak: "Si nos haces un diez por ciento, firmamos.".into(),
            example_silent: "".into(),
            limits: vec!["legal opinions".into(), "hackear".into()],
        }
    }

    #[test]
    fn el_creador_escribe_un_rol_que_se_vuelve_a_leer_igual() {
        let dir = tempfile::tempdir().unwrap();
        let creado = create_role(dir.path(), borrador("Abogado del diablo")).unwrap();
        assert_eq!(creado.id, "abogado_del_diablo");
        let leidos = load_roles(dir.path()).unwrap();
        assert_eq!(leidos, vec![creado]);
        assert_eq!(leidos[0].persona, "Max \"el duro\"");
        let texto = std::fs::read_to_string(dir.path().join("abogado_del_diablo.md")).unwrap();
        assert!(texto.contains("calibrated_with: none") && texto.contains("threshold: 0.9") && texto.contains("limits: [legal opinions]"));
    }

    #[test]
    fn el_creador_rechaza_nombres_repetidos_y_respuestas_vacias() {
        let dir = tempfile::tempdir().unwrap();
        create_role(dir.path(), borrador("Negociador")).unwrap();
        assert!(create_role(dir.path(), borrador("negociador")).unwrap_err().contains("Ya existe"));
        let mut sin_cuando = borrador("Otro");
        sin_cuando.when = "  ".into();
        assert!(create_role(dir.path(), sin_cuando).unwrap_err().contains("cuándo interviene"));
    }

    #[test]
    fn el_id_sale_del_nombre_sin_tildes_y_en_snake_case() {
        assert_eq!(role_id("Director Jurídico"), "director_juridico");
        assert_eq!(role_id("  CFO / Tesorería "), "cfo_tesoreria");
        assert_eq!(role_id("3 socios"), "rol_3_socios");
    }

    #[test]
    // Hasta la tarea 18 ningún Rol estaba calibrado; desde entonces los activos lo están (evals de la
    // Compuerta) y los experimentales siguen sin calibrar.
    fn los_roles_del_repo_cargan_y_los_activos_estan_calibrados() {
        let roles = load_roles(&roles_dir()).unwrap();
        assert!(roles.iter().any(|r| r.id == "cfo" && r.persona == "Betty"));
        assert!(roles.iter().filter(|r| r.status == "active").all(|r| r.calibrated));
        assert!(roles.iter().filter(|r| r.status == "experimental").all(|r| !r.calibrated));
    }
}

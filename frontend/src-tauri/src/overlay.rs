// SOTTOLY: segunda ventana de Tauri para las Sugerencias (overlay). Archivo nuevo.
//
// Sin bordes, siempre encima, sin robar el foco y visible al compartir pantalla
// (SPEC §7: no copiar el modo "invisible"). La página vive en overlay/ y se
// empaqueta en frontend/public/overlay/.

use tauri::{AppHandle, Runtime};

pub const LABEL: &str = "overlay";
pub const URL: &str = "overlay/index.html";
pub const WIDTH: f64 = 396.0;
pub const HEIGHT: f64 = 200.0;
/// Debajo de la barra de menús (y del notch) de macOS.
pub const TOP_MARGIN: f64 = 40.0;

/// Atajo global para silenciar. Global porque el overlay nunca toma el foco.
pub const MUTE_SHORTCUT: &str = "CommandOrControl+Shift+Period";
pub const MUTE_EVENT: &str = "overlay-mute-toggle";

/// Permisos mínimos de la ventana overlay: solo eventos (escuchar `suggestion`,
/// emitir `suggestion-feedback`).
pub const CAPABILITY: &str = r#"{
  "identifier": "overlay",
  "description": "Ventana overlay de Sottoly: eventos de Sugerencias",
  "windows": ["overlay"],
  "permissions": ["core:event:default"]
}"#;

/// Posición lógica (x, y) para centrar la ventana arriba del monitor.
pub fn top_center(monitor_width: f64, window_width: f64) -> (f64, f64) {
    todo!("{monitor_width} {window_width}")
}

/// Crea la ventana overlay y registra el atajo de silencio.
pub fn init<R: Runtime>(_app: &AppHandle<R>) -> tauri::Result<()> {
    todo!()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;
    use tauri_plugin_global_shortcut::Shortcut;

    #[test]
    fn top_center_centra_la_ventana_bajo_la_barra_de_menus() {
        assert_eq!(top_center(1512.0, WIDTH), (558.0, TOP_MARGIN));
    }

    #[test]
    fn top_center_no_sale_del_monitor_si_es_mas_angosto_que_la_ventana() {
        assert_eq!(top_center(300.0, WIDTH), (0.0, TOP_MARGIN));
    }

    #[test]
    fn el_atajo_de_silencio_es_valido() {
        assert!(MUTE_SHORTCUT.parse::<Shortcut>().is_ok());
    }

    #[test]
    fn la_capability_solo_da_eventos_a_la_ventana_overlay() {
        let cap: serde_json::Value = serde_json::from_str(CAPABILITY).unwrap();
        assert_eq!(cap["windows"], serde_json::json!([LABEL]));
        assert_eq!(cap["permissions"], serde_json::json!(["core:event:default"]));
    }

    #[test]
    fn la_pagina_del_overlay_esta_empaquetada() {
        let page = Path::new(env!("CARGO_MANIFEST_DIR")).join("../public").join(URL);
        assert!(page.exists(), "falta {}: corre `cd overlay && bun run build`", page.display());
    }
}

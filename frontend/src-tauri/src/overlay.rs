// SOTTOLY: segunda ventana de Tauri para las Sugerencias (overlay). Archivo nuevo.
//
// Sin bordes, siempre encima, sin robar el foco y visible al compartir pantalla
// (SPEC §7: no copiar el modo "invisible"). La página vive en overlay/ y se
// empaqueta en frontend/public/overlay/.

use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::ShortcutState;

pub const LABEL: &str = "overlay";
pub const URL: &str = "overlay/index.html";
pub const WIDTH: f64 = 396.0;
pub const HEIGHT: f64 = 200.0;
/// Debajo de la barra de menús (y del notch) de macOS.
pub const TOP_MARGIN: f64 = 40.0;

/// Atajo global para silenciar. Global porque el overlay nunca toma el foco.
pub const MUTE_SHORTCUT: &str = "CommandOrControl+Shift+Period";
pub const MUTE_EVENT: &str = "overlay-mute-toggle";

/// Permisos mínimos de la ventana overlay: eventos (escuchar `suggestion`,
/// emitir `suggestion-feedback`) y dejar pasar el ratón cuando no hay tarjeta.
pub const CAPABILITY: &str = r#"{
  "identifier": "overlay",
  "description": "Ventana overlay de Sottoly: eventos de Sugerencias",
  "windows": ["overlay"],
  "permissions": ["core:event:default", "core:window:allow-set-ignore-cursor-events"]
}"#;

/// Posición lógica (x, y) para centrar la ventana arriba del monitor.
pub fn top_center(monitor_width: f64, window_width: f64) -> (f64, f64) {
    (((monitor_width - window_width) / 2.0).max(0.0), TOP_MARGIN)
}

/// Crea la ventana overlay y registra el atajo de silencio.
pub fn init<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    app.add_capability(CAPABILITY)?;
    create_window(app)?;
    register_mute_shortcut(app)
}

fn create_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let monitor_width = app
        .primary_monitor()?
        .map(|m| m.size().to_logical::<f64>(m.scale_factor()).width)
        .unwrap_or(WIDTH);
    let (x, y) = top_center(monitor_width, WIDTH);

    WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App(URL.into()))
        .title("Sottoly")
        .inner_size(WIDTH, HEIGHT)
        .position(x, y)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .skip_taskbar(true)
        // Sin robar el foco: nunca pasa a ser la ventana activa, pero acepta el clic.
        .focused(false)
        .focusable(false)
        .accept_first_mouse(true)
        // Visible al compartir pantalla (SPEC §7).
        .content_protected(false)
        .build()?;
    Ok(())
}

fn register_mute_shortcut<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let plugin = tauri_plugin_global_shortcut::Builder::new()
        .with_shortcuts([MUTE_SHORTCUT])
        .map_err(|e| tauri::Error::Anyhow(e.into()))?
        .with_handler(|app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                if let Err(e) = app.emit_to(LABEL, MUTE_EVENT, ()) {
                    log::warn!("overlay: no se pudo emitir {MUTE_EVENT}: {e}");
                }
            }
        })
        .build();
    app.plugin(plugin)
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
    fn la_capability_solo_da_eventos_y_paso_de_raton_a_la_ventana_overlay() {
        let cap: serde_json::Value = serde_json::from_str(CAPABILITY).unwrap();
        assert_eq!(cap["windows"], serde_json::json!([LABEL]));
        assert_eq!(
            cap["permissions"],
            serde_json::json!(["core:event:default", "core:window:allow-set-ignore-cursor-events"])
        );
    }

    #[test]
    fn la_pagina_del_overlay_esta_empaquetada() {
        let page = Path::new(env!("CARGO_MANIFEST_DIR")).join("../public").join(URL);
        assert!(page.exists(), "falta {}: corre `cd overlay && bun run build`", page.display());
    }
}

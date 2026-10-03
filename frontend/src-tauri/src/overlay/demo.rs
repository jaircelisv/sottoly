// SOTTOLY: modo de prueba del overlay, solo para desarrollo. Archivo nuevo.
//
// Con SOTTOLY_DEMO_SUGGESTIONS=1 en un build de desarrollo emite `suggestion`
// cada 20 s, alternando Betty (CFO) y Sheldon (CEO adversarial), para probar
// el overlay sin el puente con el Motor. En un build de producción no existe:
// el módulo solo compila con debug_assertions y `enabled` exige un build de desarrollo.

use serde::Serialize;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Runtime};

pub const ENV_VAR: &str = "SOTTOLY_DEMO_SUGGESTIONS";
pub const INTERVAL: Duration = Duration::from_secs(20);
/// Primera Sugerencia poco después de arrancar, para no esperar 20 s.
pub const FIRST_DELAY: Duration = Duration::from_secs(5);

/// Mismo contrato que `SuggestionMessage` de engine/src/protocol.ts.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct DemoSuggestion {
    #[serde(rename = "type")]
    pub kind: &'static str,
    pub role: &'static str,
    pub role_label: &'static str,
    pub persona: &'static str,
    pub text: &'static str,
    pub reason: &'static str,
    pub confidence: f64,
}

/// ¿Se activa el modo demo? Solo en desarrollo y solo con la variable en "1".
pub fn enabled(is_debug_build: bool, env_value: Option<&str>) -> bool {
    is_debug_build && env_value == Some("1")
}

// Reunión de ejemplo: el Usuario negocia honorarios con un contador.
const BETTY: [(&str, &str); 3] = [
    (
        "Pregunta si los honorarios mensuales incluyen IVA.",
        "Dio una tarifa sin aclarar impuestos.",
    ),
    (
        "Pide el costo de la declaración de renta por separado.",
        "Habló de un paquete completo sin detallar qué cubre.",
    ),
    (
        "Confirma si hay recargo por facturas atrasadas o fuera de fecha.",
        "Mencionó cobros extra sin decir cuánto.",
    ),
];

const SHELDON: [(&str, &str); 3] = [
    (
        "Pide un caso real donde ya aplicó ese beneficio tributario.",
        "Se aceptó el ahorro estimado sin evidencia.",
    ),
    (
        "Pregunta quién responde si la DIAN rechaza la deducción.",
        "Nadie mencionó el riesgo de una sanción.",
    ),
    (
        "No firmes el contrato anual todavía; pide tres meses de prueba.",
        "Se está cerrando el plazo por inercia.",
    ),
];

/// La n-ésima Sugerencia de la demo: pares de Betty, impares de Sheldon.
pub fn suggestion(n: usize) -> DemoSuggestion {
    let (role, persona, pool, confidence) = if n % 2 == 0 {
        ("cfo", "Betty", &BETTY, 0.82)
    } else {
        ("ceo", "Sheldon", &SHELDON, 0.88)
    };
    let (text, reason) = pool[(n / 2) % pool.len()];
    DemoSuggestion { kind: "suggestion", role, persona, text, reason, confidence }
}

/// Arranca la demo si corresponde. Llamado desde overlay::init.
pub fn start<R: Runtime>(app: &AppHandle<R>) {
    let env_value = std::env::var(ENV_VAR).ok();
    if !enabled(cfg!(debug_assertions), env_value.as_deref()) {
        return;
    }
    log::warn!("overlay: modo demo activo ({ENV_VAR}=1), Sugerencias de prueba cada {INTERVAL:?}");
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(FIRST_DELAY).await;
        for n in 0.. {
            if let Err(e) = app.emit_to(super::LABEL, "suggestion", suggestion(n)) {
                log::warn!("overlay: demo no pudo emitir suggestion: {e}");
            }
            tokio::time::sleep(INTERVAL).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nunca_se_activa_en_un_build_de_produccion() {
        assert!(!enabled(false, Some("1")));
        assert!(!enabled(false, None));
    }

    #[test]
    fn en_desarrollo_solo_se_activa_con_la_variable_en_1() {
        assert!(enabled(true, Some("1")));
        assert!(!enabled(true, None));
        assert!(!enabled(true, Some("0")));
        assert!(!enabled(true, Some("true")));
        assert!(!enabled(true, Some("")));
    }

    #[test]
    fn el_modulo_solo_compila_en_desarrollo() {
        // Si alguien quita el cfg, el modo demo llegaría a producción.
        let overlay = include_str!("../overlay.rs");
        assert!(
            overlay.contains("#[cfg(debug_assertions)]\npub mod demo;"),
            "overlay.rs debe declarar `pub mod demo;` bajo #[cfg(debug_assertions)]"
        );
        assert!(
            overlay.contains("#[cfg(debug_assertions)]\n    demo::start(app);"),
            "overlay::init debe llamar a demo::start bajo #[cfg(debug_assertions)]"
        );
    }

    #[test]
    fn alterna_betty_y_sheldon() {
        let who: Vec<_> = (0..4)
            .map(|n| (suggestion(n).persona, suggestion(n).role, suggestion(n).role_label))
            .collect();
        assert_eq!(
            who,
            [
                ("Betty", "cfo", "CFO"),
                ("Sheldon", "ceo", "CEO adversarial"),
                ("Betty", "cfo", "CFO"),
                ("Sheldon", "ceo", "CEO adversarial"),
            ]
        );
    }

    #[test]
    fn no_repite_la_sugerencia_anterior() {
        for n in 0..12 {
            assert_ne!(suggestion(n).text, suggestion(n + 1).text);
            assert_ne!(suggestion(n).text, suggestion(n + 2).text, "n = {n}");
        }
    }

    #[test]
    fn cumple_el_contrato_del_protocolo() {
        for n in 0..12 {
            let s = suggestion(n);
            let json = serde_json::to_value(&s).unwrap();
            assert_eq!(json["type"], "suggestion");
            assert!(s.role.chars().all(|c| c.is_ascii_lowercase() || c == '_'));
            assert!(!s.persona.is_empty() && !s.reason.is_empty());
            assert!(!s.role_label.is_empty());
            assert_eq!(json["role_label"], s.role_label);
            assert!((0.0..=1.0).contains(&s.confidence));
            // SPEC §4 Redacción: máximo 15 palabras.
            assert!(s.text.split_whitespace().count() <= 15, "{}", s.text);
        }
    }
}

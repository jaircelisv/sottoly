// SOTTOLY: archivo nuevo. Interruptor de las tarjetas de demostración desde el panel (tarea 22, pedido de
// Jair). La demo solo existe en desarrollo (overlay/demo.rs compila con debug_assertions); en producción el
// panel no muestra el interruptor y prenderla no hace nada.
use serde::Serialize;

#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
pub struct DemoStatus {
    /// ¿Existe la demo en este build? Solo en desarrollo.
    pub available: bool,
    pub on: bool,
}

pub fn status() -> DemoStatus {
    #[cfg(debug_assertions)]
    {
        DemoStatus { available: true, on: crate::overlay::demo::is_on() }
    }
    #[cfg(not(debug_assertions))]
    {
        DemoStatus { available: false, on: false }
    }
}

#[tauri::command]
pub fn sottoly_demo_status() -> DemoStatus {
    status()
}

#[tauri::command]
pub fn sottoly_set_demo(on: bool) -> Result<DemoStatus, String> {
    #[cfg(debug_assertions)]
    {
        crate::overlay::demo::set_on(on);
        Ok(status())
    }
    #[cfg(not(debug_assertions))]
    {
        let _ = on;
        Err("Las tarjetas de demostración solo existen en desarrollo.".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn en_desarrollo_se_prende_y_se_apaga() {
        sottoly_set_demo(true).unwrap();
        assert_eq!(sottoly_demo_status(), DemoStatus { available: true, on: true });
        sottoly_set_demo(false).unwrap();
        assert!(!sottoly_demo_status().on);
    }
}

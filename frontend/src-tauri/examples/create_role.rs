// SOTTOLY: el creador de Roles para el gate (tarea 14). Lee un borrador por stdin (JSON, lo mismo que
// manda la pantalla) y lo crea en SOTTOLY_ROLES_DIR con la misma función que el comando de la App.
//   {"ok":true,"id":"negociador"}  |  {"ok":false,"error":"…"}
use app_lib::sottoly_roles::{create_role, roles_dir, RoleDraft};
use std::io::Read;

fn main() {
    let mut input = String::new();
    std::io::stdin().read_to_string(&mut input).expect("stdin");
    let out = match serde_json::from_str::<RoleDraft>(&input) {
        Err(e) => serde_json::json!({ "ok": false, "error": format!("borrador inválido: {e}") }),
        Ok(draft) => match create_role(&roles_dir(), draft) {
            Ok(role) => serde_json::json!({ "ok": true, "id": role.id }),
            Err(error) => serde_json::json!({ "ok": false, "error": error }),
        },
    };
    println!("{out}");
}

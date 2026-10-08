// SOTTOLY: Decisiones del cierre para el gate (tarea 17). Lee por stdin
//   {"title":"…","created_at":"…","summary":[Decision…] | null,"review":[{id,approved,text}] | null}
// En carpetas temporales (la de la Reunión y la Memoria): guarda el summary con la Reunión, lo revisa si
// hay `review` y cuenta lo que quedó. Imprime {"guardadas":n,"por_revisar":bool,"memoria_lineas":[…] | null}.
use app_lib::engine_bridge::Decision;
use app_lib::sottoly_decisions::{load_decisions, review_decisions, store_summary, ReviewItem};
use std::io::Read;

fn main() {
    let mut input = String::new();
    std::io::stdin().read_to_string(&mut input).expect("stdin");
    let v: serde_json::Value = serde_json::from_str(&input).expect("json");
    let folder = tempfile::tempdir().expect("tmp");
    let memory = tempfile::tempdir().expect("tmp");

    if let Some(summary) = v.get("summary").filter(|s| !s.is_null()) {
        let decisions: Vec<Decision> = serde_json::from_value(summary.clone()).expect("decisions");
        store_summary(folder.path(), &decisions).expect("guardar");
    }
    if let Some(review) = v.get("review").filter(|r| !r.is_null()) {
        let items: Vec<ReviewItem> = serde_json::from_value(review.clone()).expect("review");
        review_decisions(folder.path(), memory.path(), v["title"].as_str().unwrap_or("Reunión"), v["created_at"].as_str().unwrap_or(""), &items)
            .expect("revisar");
    }
    let file = load_decisions(folder.path());
    let memoria = std::fs::read_dir(memory.path()).ok().and_then(|mut d| d.next()).and_then(|e| e.ok()).map(|e| {
        std::fs::read_to_string(e.path())
            .unwrap_or_default()
            .lines()
            .filter_map(|l| l.strip_prefix("- ").map(|s| s.to_string()))
            .collect::<Vec<_>>()
    });
    println!(
        "{}",
        serde_json::json!({
            "guardadas": file.as_ref().map(|f| f.decisions.len()).unwrap_or(0),
            "por_revisar": file.as_ref().map(|f| !f.reviewed).unwrap_or(false),
            "memoria_lineas": memoria,
        })
    );
}

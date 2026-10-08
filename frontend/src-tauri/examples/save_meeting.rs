// SOTTOLY: guardar una Reunión y leerla, para el gate (tarea 15). Lee por stdin
//   {"title":"…","segments":[{"id":"…","text":"…","timestamp":"…","speaker":"user"},…]}
// la guarda con el repositorio real de Meetily en una base SQLite temporal (con sus migraciones) y
// imprime cómo vuelve: {"speakers":["user","counterpart",null,…],"texts":[…]}.
use app_lib::api::TranscriptSegment;
use app_lib::database::repositories::{meeting::MeetingsRepository, transcript::TranscriptsRepository};
use std::io::Read;

fn main() {
    let mut input = String::new();
    std::io::stdin().read_to_string(&mut input).expect("stdin");
    let v: serde_json::Value = serde_json::from_str(&input).expect("json");
    let title = v["title"].as_str().unwrap_or("Reunión").to_string();
    let segments: Vec<TranscriptSegment> = serde_json::from_value(v["segments"].clone()).expect("segments");

    tauri::async_runtime::block_on(async move {
        let dir = tempfile::tempdir().expect("tmp");
        let url = format!("sqlite://{}?mode=rwc", dir.path().join("t.sqlite").display());
        let pool = sqlx::SqlitePool::connect(&url).await.expect("db");
        sqlx::migrate!("./migrations").run(&pool).await.expect("migraciones");
        let id = TranscriptsRepository::save_transcript(&pool, &title, &segments, None).await.expect("guardar");
        let meeting = MeetingsRepository::get_meeting(&pool, &id).await.expect("leer").expect("existe");
        let out = serde_json::json!({
            "speakers": meeting.transcripts.iter().map(|t| serde_json::to_value(t).unwrap()["speaker"].clone()).collect::<Vec<_>>(),
            "texts": meeting.transcripts.iter().map(|t| t.text.clone()).collect::<Vec<_>>(),
        });
        println!("{out}");
    });
}

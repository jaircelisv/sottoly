// SOTTOLY: estado de los modelos locales de Meetily.
// Uso: cargo run --example check_local_model -- <models_dir> [nombre...]
use app_lib::local_model::check_local_model;
use app_lib::summary::summary_engine::models::get_available_models;
use std::path::PathBuf;

fn main() {
    let mut args = std::env::args().skip(1);
    let dir = PathBuf::from(args.next().expect("uso: check_local_model <models_dir> [nombre...]"));
    let mut names: Vec<String> = args.collect();
    if names.is_empty() {
        names = get_available_models().into_iter().map(|m| m.name).collect();
    }
    for name in names {
        println!("{name}\t{}", serde_json::to_string(&check_local_model(&dir, &name)).unwrap());
    }
}

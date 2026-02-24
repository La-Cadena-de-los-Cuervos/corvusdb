mod app_state;
mod desktop_commands;
mod error;
mod models;
mod mongodb_service;
mod storage;

use std::path::PathBuf;

use app_state::AppState;
use desktop_commands::AppSharedState;

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "corvusdb=info".into()),
        )
        .init();

    let storage_path = PathBuf::from("data/connections.json");
    let state = tauri::async_runtime::block_on(AppState::new(storage_path))
        .expect("failed to initialize app state");

    tauri::Builder::default()
        .manage(AppSharedState(state))
        .invoke_handler(tauri::generate_handler![
            desktop_commands::list_connections,
            desktop_commands::save_connection,
            desktop_commands::test_connection,
            desktop_commands::list_collections,
            desktop_commands::run_find_query,
            desktop_commands::run_aggregate_query,
            desktop_commands::insert_document,
            desktop_commands::update_documents,
            desktop_commands::delete_documents
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

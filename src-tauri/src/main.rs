mod app_state;
mod desktop_commands;
mod error;
mod models;
mod mongodb_service;
mod storage;

use app_state::AppState;
use desktop_commands::AppSharedState;
use tauri::Manager;

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "corvusdb=info".into()),
        )
        .init();

    tauri::Builder::default()
        .setup(|app| {
            let mut storage_path = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            storage_path.push("corvusdb");
            storage_path.push("connections.json");

            let state = tauri::async_runtime::block_on(AppState::new(storage_path))
                .expect("failed to initialize app state");
            app.manage(AppSharedState(state));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_commands::list_connections,
            desktop_commands::save_connection,
            desktop_commands::test_connection,
            desktop_commands::list_databases,
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

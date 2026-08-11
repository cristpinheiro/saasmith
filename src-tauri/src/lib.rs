mod commands;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            commands::read_project,
            commands::write_project,
            commands::call_ai,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

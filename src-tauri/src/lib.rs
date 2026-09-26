mod db;
mod gacha;
mod probe;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            gacha::gacha_query,
            db::db_insert_records,
            db::db_load_records,
            db::db_list_archives,
            db::db_clear_archive,
            db::db_export_to_file,
            db::db_import_from_file,
            probe::probe_game_dir,
            probe::extract_gacha_links,
            probe::extract_links_from_file,
        ])
        .build(tauri::generate_context!())
        .expect("Tauri 应用初始化失败")
        .run(|app, event| {
            // macOS 上关闭最后一个窗口默认只关窗口不退进程;本应用为单窗口工具,直接退出
            if let tauri::RunEvent::ExitRequested { code: None, .. } = event {
                app.exit(0);
            }
        });
}

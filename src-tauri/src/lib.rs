mod db;
mod gacha;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            gacha::gacha_query,
            db::db_insert_records,
            db::db_load_records,
            db::db_list_archives,
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

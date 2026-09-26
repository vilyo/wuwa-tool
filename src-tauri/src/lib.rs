#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .build(tauri::generate_context!())
        .expect("Tauri 应用初始化失败")
        .run(|app, event| {
            // macOS 上关闭最后一个窗口默认只关窗口不退进程;本应用为单窗口工具,直接退出
            if let tauri::RunEvent::ExitRequested { code: None, .. } = event {
                app.exit(0);
            }
        });
}

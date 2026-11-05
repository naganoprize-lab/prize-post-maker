mod storage;
mod excel;
use tauri::Manager;
use std::sync::Mutex;

#[tauri::command]
fn load_data(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    storage::load(&dir).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_data(app: tauri::AppHandle, data: String, lock: tauri::State<'_, Mutex<()>>) -> Result<(), String> {
    let _guard = lock.lock().map_err(|e| e.to_string())?;
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    storage::save(&dir, &data).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_excel(path: String) -> Result<tauri::ipc::Response, String> {
    excel::read(std::path::Path::new(&path)).map(tauri::ipc::Response::new).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Mutex::new(()))
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                if let Ok(Some(monitor)) = window.current_monitor() {
                    let area = monitor.work_area();
                    let scale = monitor.scale_factor();
                    let width = (area.size.width as f64 / scale).min(1280.0).max(640.0);
                    let height = (area.size.height as f64 / scale - 48.0).min(800.0).max(480.0);
                    let _ = window.set_size(tauri::LogicalSize::new(width, height));
                    let _ = window.center();
                }
            }
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![load_data, save_data, read_excel])
        .run(tauri::generate_context!())
        .expect("アプリを起動できませんでした");
}

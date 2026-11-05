mod storage;
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Mutex::new(()))
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![load_data, save_data])
        .run(tauri::generate_context!())
        .expect("アプリを起動できませんでした");
}

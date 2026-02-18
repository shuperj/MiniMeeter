mod accent;
mod commands;
mod voicemeeter;

use commands::VmState;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use tauri::{Manager, WebviewWindow};

pub struct WindowState {
    pub window: Mutex<Option<WebviewWindow>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(VmState {
            api: Mutex::new(None),
            polling: Arc::new(AtomicBool::new(false)),
        })
        .manage(WindowState {
            window: Mutex::new(None),
        })
        .setup(|app| {
            let window = app
                .get_webview_window("main")
                .expect("Failed to get main window");

            // Store window handle for runtime acrylic toggling
            let ws: tauri::State<WindowState> = app.state();
            *ws.window.lock().unwrap() = Some(window.clone());

            // Apply acrylic glass effect by default
            #[cfg(target_os = "windows")]
            {
                use window_vibrancy::apply_acrylic;
                let _ = apply_acrylic(&window, Some((30, 30, 30, 200)));
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::vm_login,
            commands::vm_logout,
            commands::vm_set_gain,
            commands::vm_set_mute,
            commands::vm_get_all_strips,
            commands::vm_set_a1_device,
            commands::vm_restart_engine,
            commands::get_accent_color,
            commands::set_acrylic,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

use crate::accent::{get_system_accent_color, AccentColor};
use crate::voicemeeter::VoicemeeterAPI;
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use crate::WindowState;

pub struct VmState {
    pub api: Mutex<Option<VoicemeeterAPI>>,
    pub polling: Arc<AtomicBool>,
}

#[derive(Debug, Clone, Serialize)]
pub struct StripState {
    pub strip: u32,
    pub gain: f32,
    pub muted: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct AllStripsState {
    pub strips: Vec<StripState>,
}

#[derive(Debug, Clone, Serialize)]
pub struct StripLevel {
    pub strip: u32,
    pub level: f32,
}

#[derive(Debug, Clone, Serialize)]
pub struct AllStripLevels {
    pub levels: Vec<StripLevel>,
}

/// Monitor all 5 Banana strips — frontend decides which to display
const MONITORED_STRIPS: &[u32] = &[0, 1, 2, 3, 4];

/// Maps strip index to its first L/R channel pair for GetLevel.
/// Banana: HW inputs (0-2) = 2 channels each, Virtual inputs (3-4) = 8 channels each.
/// Channel layout: [0,1] [2,3] [4,5] [6..13] [14..21]
fn strip_to_channels(strip: u32) -> (i32, i32) {
    let base: i32 = match strip {
        0 => 0,
        1 => 2,
        2 => 4,
        3 => 6,  // Virtual Input 1: 8 channels starting at 6
        4 => 14, // Virtual Input 2: 8 channels starting at 14
        _ => 0,
    };
    (base, base + 1)
}

fn read_strip_level(api: &VoicemeeterAPI, strip: u32) -> StripLevel {
    let (ch_l, ch_r) = strip_to_channels(strip);
    let level_l = api.get_level(1, ch_l).unwrap_or(0.0);
    let level_r = api.get_level(1, ch_r).unwrap_or(0.0);
    StripLevel { strip, level: level_l.max(level_r) }
}

fn read_strip(api: &VoicemeeterAPI, strip: u32) -> StripState {
    let gain = api.get_float(&format!("Strip[{strip}].Gain")).unwrap_or(0.0);
    let mute_val = api.get_float(&format!("Strip[{strip}].Mute")).unwrap_or(0.0);
    StripState {
        strip,
        gain,
        muted: mute_val >= 1.0,
    }
}

#[tauri::command]
pub fn vm_login(state: State<VmState>, app: AppHandle) -> Result<String, String> {
    let mut guard = state.api.lock().map_err(|e| e.to_string())?;

    if guard.is_some() {
        return Ok("Already logged in".into());
    }

    let mut api = VoicemeeterAPI::new()?;
    api.login()?;
    *guard = Some(api);
    drop(guard);

    // Start polling thread
    state.polling.store(true, Ordering::SeqCst);
    let polling = state.polling.clone();
    let app_handle = app.clone();

    thread::spawn(move || {
        while polling.load(Ordering::SeqCst) {
            let vm_state: State<VmState> = app_handle.state();
            let guard = vm_state.api.lock();
            if let Ok(ref lock) = guard {
                if let Some(ref api) = **lock {
                    // Check for parameter changes (gain, mute)
                    let dirty = api.is_dirty();
                    match dirty {
                        Ok(true) => {
                            let strips: Vec<StripState> = MONITORED_STRIPS
                                .iter()
                                .map(|&s| read_strip(api, s))
                                .collect();
                            let _ = app_handle.emit("vm:state-update", AllStripsState { strips });
                        }
                        Ok(false) => {}
                        Err(_) => {
                            polling.store(false, Ordering::SeqCst);
                            drop(guard);
                            break;
                        }
                    }

                    // Always read levels (they change continuously)
                    let levels: Vec<StripLevel> = MONITORED_STRIPS
                        .iter()
                        .map(|&s| read_strip_level(api, s))
                        .collect();
                    let _ = app_handle.emit("vm:levels", AllStripLevels { levels });
                }
            }
            drop(guard);
            thread::sleep(Duration::from_millis(33)); // ~30fps
        }
    });

    Ok("Logged in".into())
}

#[tauri::command]
pub fn vm_logout(state: State<VmState>) -> Result<String, String> {
    state.polling.store(false, Ordering::SeqCst);
    let mut guard = state.api.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut api) = *guard {
        api.logout();
    }
    *guard = None;
    Ok("Logged out".into())
}

#[tauri::command]
pub fn vm_set_gain(state: State<VmState>, strip: u32, value: f32) -> Result<(), String> {
    let guard = state.api.lock().map_err(|e| e.to_string())?;
    let api = guard.as_ref().ok_or("Not connected")?;
    api.set_float(&format!("Strip[{strip}].Gain"), value)
}

#[tauri::command]
pub fn vm_set_mute(state: State<VmState>, strip: u32, muted: bool) -> Result<(), String> {
    let guard = state.api.lock().map_err(|e| e.to_string())?;
    let api = guard.as_ref().ok_or("Not connected")?;
    api.set_float(
        &format!("Strip[{strip}].Mute"),
        if muted { 1.0 } else { 0.0 },
    )
}

#[tauri::command]
pub fn vm_get_all_strips(state: State<VmState>) -> Result<AllStripsState, String> {
    let guard = state.api.lock().map_err(|e| e.to_string())?;
    let api = guard.as_ref().ok_or("Not connected")?;
    // Call is_dirty first to sync parameters
    let _ = api.is_dirty();
    let strips = MONITORED_STRIPS
        .iter()
        .map(|&s| read_strip(api, s))
        .collect();
    Ok(AllStripsState { strips })
}

#[tauri::command]
pub fn vm_set_a1_device(
    state: State<VmState>,
    driver: String,
    name: String,
) -> Result<(), String> {
    let guard = state.api.lock().map_err(|e| e.to_string())?;
    let api = guard.as_ref().ok_or("Not connected")?;
    let param = format!("Bus[0].Device.{driver}");
    let rc = api.set_string(&param, &name);
    if rc.is_ok() {
        let _ = api.set_string("Command", "Restart");
    }
    rc
}

#[tauri::command]
pub fn vm_restart_engine(state: State<VmState>) -> Result<(), String> {
    let guard = state.api.lock().map_err(|e| e.to_string())?;
    let api = guard.as_ref().ok_or("Not connected")?;
    api.set_string("Command", "Restart")
}

#[tauri::command]
pub fn get_accent_color() -> AccentColor {
    get_system_accent_color()
}

#[tauri::command]
pub fn set_acrylic(window_state: State<WindowState>, enabled: bool) -> Result<(), String> {
    let guard = window_state.window.lock().map_err(|e| e.to_string())?;
    let window = guard.as_ref().ok_or("No window")?;

    #[cfg(target_os = "windows")]
    {
        use window_vibrancy::{apply_acrylic, clear_acrylic};
        let _ = clear_acrylic(window);
        if enabled {
            apply_acrylic(window, Some((10, 10, 10, 255))).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

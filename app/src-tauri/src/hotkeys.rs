//! Global hotkey bindings and dispatch.
//!
//! A binding maps a normalized accelerator string to a `HotkeyAction`. The
//! frontend owns the list (mute hotkeys from channel config plus FX group
//! hotkeys) and re-syncs the whole set whenever it changes; `vm_sync_shortcuts`
//! is the only place that unregisters everything, so mute and FX hotkeys must
//! always be synced together.
//!
//! The keyboard's volume keys act on every hardware bus at once, so they work
//! whichever output is in use. Virtual buses are left alone: they feed recording
//! and voice chat, not what the user hears.
//!
//! Lock order: `ShortcutMap` is always released before touching `FxState` or
//! `VmState.api`. `FxState` is taken before `VmState.api`, never the reverse.

use crate::commands::VmState;
use crate::fx;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager};

const VOLUME_STEP_DB: f32 = 2.0;
/// Where the quietest bus stops the volume keys. Voicemeeter's faders go lower,
/// but this is already silent and leaves a usable climb back up.
const VOLUME_MIN_DB: f32 = -60.0;
/// The top of Voicemeeter's bus faders.
const VOLUME_MAX_DB: f32 = 12.0;
const VOLUME_REPEAT_DELAY: Duration = Duration::from_millis(350);
const VOLUME_REPEAT_INTERVAL: Duration = Duration::from_millis(90);
/// A full sweep of the range, so a release that never arrives can't spin forever.
const VOLUME_REPEAT_MAX: u32 = 30;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum HotkeyAction {
    ToggleMute { strip: u32 },
    ToggleFxGroup { id: String },
    VolumeUp,
    VolumeDown,
    MuteOutputs,
}

#[derive(Clone, Debug, Deserialize)]
pub struct HotkeyBinding {
    pub hotkey: String,
    pub action: HotkeyAction,
}

/// Normalized accelerator string -> action.
pub struct ShortcutMap {
    pub map: Mutex<HashMap<String, HotkeyAction>>,
    /// Bumped to cancel a running key repeat; a repeat runs while it still
    /// matches the value it started with.
    volume_repeat: AtomicU64,
    /// Buses the mute key silenced, so unmuting leaves the rest as they were.
    muted_by_key: Mutex<Vec<u32>>,
}

impl Default for ShortcutMap {
    fn default() -> Self {
        Self {
            map: Mutex::new(HashMap::new()),
            volume_repeat: AtomicU64::new(0),
            muted_by_key: Mutex::new(Vec::new()),
        }
    }
}

/// Called from the global-shortcut plugin handler on key press.
pub fn handle_shortcut(app: &AppHandle, shortcut_str: &str) {
    let action = {
        let sm: tauri::State<ShortcutMap> = app.state();
        let Ok(map) = sm.map.lock() else { return };
        match map.get(shortcut_str) {
            Some(a) => a.clone(),
            None => return,
        }
    };
    // ShortcutMap lock released — now dispatch.
    dispatch(app, action);
}

fn dispatch(app: &AppHandle, action: HotkeyAction) {
    match action {
        HotkeyAction::ToggleMute { strip } => toggle_mute(app, strip),
        HotkeyAction::ToggleFxGroup { id } => {
            if let Err(e) = fx::toggle_group(app, &id) {
                eprintln!("FX group '{id}' toggle failed: {e}");
            }
        }
        HotkeyAction::VolumeUp => start_volume_repeat(app, VOLUME_STEP_DB),
        HotkeyAction::VolumeDown => start_volume_repeat(app, -VOLUME_STEP_DB),
        HotkeyAction::MuteOutputs => toggle_outputs_mute(app),
    }
}

/// New gains for one volume key step. Every bus moves by the same amount so
/// their balance survives: going up, that amount stops when the loudest bus
/// reaches the ceiling, and going down, when the quietest reaches the floor.
fn stepped_gains(gains: &[f32], delta: f32) -> Vec<f32> {
    let loudest = gains.iter().copied().fold(f32::NEG_INFINITY, f32::max);
    let quietest = gains.iter().copied().fold(f32::INFINITY, f32::min);
    let shift = if delta > 0.0 {
        delta.min((VOLUME_MAX_DB - loudest).max(0.0))
    } else {
        delta.max((VOLUME_MIN_DB - quietest).min(0.0))
    };
    gains.iter().map(|g| g + shift).collect()
}

/// What the mute key should do, as the buses to change and the mute value to
/// give them. Unmutes only what it muted, so a bus the user had silenced stays
/// that way. If everything is already muted by hand, it unmutes everything.
fn mute_key_plan(muted: &[bool], muted_by_key: &[u32]) -> (Vec<u32>, bool) {
    let is_muted = |bus: u32| muted.get(bus as usize).copied().unwrap_or(false);
    let ours: Vec<u32> = muted_by_key.iter().copied().filter(|b| is_muted(*b)).collect();
    if !ours.is_empty() {
        return (ours, false);
    }
    let all = 0..muted.len() as u32;
    let unmuted: Vec<u32> = all.clone().filter(|b| !is_muted(*b)).collect();
    if unmuted.is_empty() {
        (all.collect(), false)
    } else {
        (unmuted, true)
    }
}

fn step_volume(app: &AppHandle, delta: f32) {
    let vs: tauri::State<VmState> = app.state();
    let bus_count = vs.edition_or_default().hw_bus_count();
    let Ok(guard) = vs.api.lock() else { return };
    let Some(ref api) = *guard else { return };
    let gains: Vec<f32> = (0..bus_count)
        .map(|b| api.get_float(&format!("Bus[{b}].Gain")).unwrap_or(0.0))
        .collect();
    for (bus, gain) in stepped_gains(&gains, delta).into_iter().enumerate() {
        let _ = api.set_float(&format!("Bus[{bus}].Gain"), gain);
    }
}

/// One step now, then more while the key is held. The OS can't repeat these for
/// us: global-hotkey registers with MOD_NOREPEAT.
fn start_volume_repeat(app: &AppHandle, delta: f32) {
    step_volume(app, delta);
    let sm: tauri::State<ShortcutMap> = app.state();
    let run = sm.volume_repeat.fetch_add(1, Ordering::SeqCst) + 1;
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(VOLUME_REPEAT_DELAY);
        for _ in 0..VOLUME_REPEAT_MAX {
            let sm: tauri::State<ShortcutMap> = app.state();
            if sm.volume_repeat.load(Ordering::SeqCst) != run {
                return;
            }
            step_volume(&app, delta);
            std::thread::sleep(VOLUME_REPEAT_INTERVAL);
        }
    });
}

/// Called from the global-shortcut plugin handler on key release.
pub fn stop_volume_repeat(app: &AppHandle) {
    let sm: tauri::State<ShortcutMap> = app.state();
    sm.volume_repeat.fetch_add(1, Ordering::SeqCst);
}

fn toggle_outputs_mute(app: &AppHandle) {
    let sm: tauri::State<ShortcutMap> = app.state();
    let Ok(mut muted_by_key) = sm.muted_by_key.lock() else { return };
    let vs: tauri::State<VmState> = app.state();
    let bus_count = vs.edition_or_default().hw_bus_count();
    let Ok(guard) = vs.api.lock() else { return };
    let Some(ref api) = *guard else { return };
    let muted: Vec<bool> = (0..bus_count)
        .map(|b| api.get_float(&format!("Bus[{b}].Mute")).unwrap_or(0.0) >= 1.0)
        .collect();
    let (buses, mute) = mute_key_plan(&muted, &muted_by_key);
    for bus in &buses {
        let _ = api.set_float(&format!("Bus[{bus}].Mute"), if mute { 1.0 } else { 0.0 });
    }
    *muted_by_key = if mute { buses } else { Vec::new() };
}

fn toggle_mute(app: &AppHandle, strip: u32) {
    let vs: tauri::State<VmState> = app.state();
    let Ok(guard) = vs.api.lock() else { return };
    if let Some(ref api) = *guard {
        let param = format!("Strip[{strip}].Mute");
        let current = api.get_float(&param).unwrap_or(0.0);
        let new_val = if current >= 1.0 { 0.0 } else { 1.0 };
        let _ = api.set_float(&param, new_val);
    }
}

/// Replace every registered global shortcut with `bindings`. Returns the hotkeys
/// that could not be registered, usually because another program holds them.
#[tauri::command]
pub fn vm_sync_shortcuts(
    app: AppHandle,
    shortcut_map: tauri::State<ShortcutMap>,
    bindings: Vec<HotkeyBinding>,
) -> Result<Vec<String>, String> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;

    let manager = app.global_shortcut();
    manager.unregister_all().map_err(|e| format!("{e:?}"))?;

    shortcut_map.volume_repeat.fetch_add(1, Ordering::SeqCst);

    let mut map = shortcut_map.map.lock().map_err(|e| e.to_string())?;
    map.clear();
    let mut failed = Vec::new();

    for binding in bindings {
        if binding.hotkey.is_empty() {
            continue;
        }
        let shortcut = match binding.hotkey.parse::<tauri_plugin_global_shortcut::Shortcut>() {
            Ok(s) => s,
            Err(e) => {
                eprintln!("Failed to parse shortcut '{}': {e:?}", binding.hotkey);
                failed.push(binding.hotkey);
                continue;
            }
        };
        let normalized = shortcut.to_string();
        if map.contains_key(&normalized) {
            eprintln!(
                "Shortcut '{}' is bound twice; keeping the first binding",
                binding.hotkey
            );
            continue;
        }
        match manager.register(shortcut) {
            Ok(_) => {
                map.insert(normalized, binding.action);
            }
            Err(e) => {
                eprintln!("Failed to register shortcut '{}': {e:?}", binding.hotkey);
                failed.push(binding.hotkey);
            }
        }
    }

    Ok(failed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn actions_round_trip_through_json() {
        let mute: HotkeyAction =
            serde_json::from_str(r#"{"type":"toggleMute","strip":3}"#).unwrap();
        assert_eq!(mute, HotkeyAction::ToggleMute { strip: 3 });

        let fx: HotkeyAction =
            serde_json::from_str(r#"{"type":"toggleFxGroup","id":"abc"}"#).unwrap();
        assert_eq!(fx, HotkeyAction::ToggleFxGroup { id: "abc".into() });

        let back = serde_json::to_string(&fx).unwrap();
        assert!(back.contains(r#""type":"toggleFxGroup""#));
    }

    #[test]
    fn volume_actions_deserialize() {
        let up: HotkeyAction = serde_json::from_str(r#"{"type":"volumeUp"}"#).unwrap();
        assert_eq!(up, HotkeyAction::VolumeUp);
        let down: HotkeyAction = serde_json::from_str(r#"{"type":"volumeDown"}"#).unwrap();
        assert_eq!(down, HotkeyAction::VolumeDown);
        let mute: HotkeyAction = serde_json::from_str(r#"{"type":"muteOutputs"}"#).unwrap();
        assert_eq!(mute, HotkeyAction::MuteOutputs);
    }

    #[test]
    fn volume_steps_keep_the_balance_between_buses() {
        assert_eq!(stepped_gains(&[-10.0, -20.0], 2.0), vec![-8.0, -18.0]);
        assert_eq!(stepped_gains(&[-10.0, -20.0], -2.0), vec![-12.0, -22.0]);
    }

    #[test]
    fn volume_up_stops_when_the_loudest_bus_reaches_the_ceiling() {
        assert_eq!(stepped_gains(&[11.0, -20.0], 2.0), vec![12.0, -19.0]);
        assert_eq!(stepped_gains(&[12.0, -20.0], 2.0), vec![12.0, -20.0]);
    }

    #[test]
    fn volume_up_can_go_past_unity() {
        assert_eq!(stepped_gains(&[0.0, -20.0], 2.0), vec![2.0, -18.0]);
    }

    #[test]
    fn volume_down_stops_when_the_quietest_bus_reaches_the_floor() {
        assert_eq!(stepped_gains(&[-59.0, -10.0], -2.0), vec![-60.0, -11.0]);
        assert_eq!(stepped_gains(&[-60.0, -10.0], -2.0), vec![-60.0, -10.0]);
    }

    #[test]
    fn holding_down_then_up_keeps_the_balance() {
        let mut gains = vec![-12.0, 0.0];
        for _ in 0..40 {
            gains = stepped_gains(&gains, -VOLUME_STEP_DB);
        }
        assert_eq!(gains, vec![-60.0, -48.0]);
        for _ in 0..12 {
            gains = stepped_gains(&gains, VOLUME_STEP_DB);
        }
        assert_eq!(gains, vec![-36.0, -24.0]);
    }

    #[test]
    fn a_bus_already_below_the_floor_does_not_jump_up() {
        assert_eq!(stepped_gains(&[-70.0, -10.0], -2.0), vec![-70.0, -10.0]);
    }

    #[test]
    fn mute_key_mutes_only_what_is_playing_and_restores_only_that() {
        let muted = [false, true, false];
        assert_eq!(mute_key_plan(&muted, &[]), (vec![0, 2], true));
        // A2 was silent before the key was pressed, so it stays silent.
        let after = [true, true, true];
        assert_eq!(mute_key_plan(&after, &[0, 2]), (vec![0, 2], false));
    }

    #[test]
    fn mute_key_ignores_a_remembered_bus_the_user_unmuted() {
        assert_eq!(mute_key_plan(&[false, true], &[0, 1]), (vec![1], false));
    }

    #[test]
    fn mute_key_starts_over_when_every_remembered_bus_was_unmuted_by_hand() {
        assert_eq!(mute_key_plan(&[false, false], &[0, 1]), (vec![0, 1], true));
    }

    #[test]
    fn mute_key_unmutes_everything_when_all_were_muted_by_hand() {
        assert_eq!(mute_key_plan(&[true, true], &[]), (vec![0, 1], false));
    }

    #[test]
    fn binding_deserializes() {
        let b: HotkeyBinding = serde_json::from_str(
            r#"{"hotkey":"CmdOrCtrl+Shift+M","action":{"type":"toggleMute","strip":0}}"#,
        )
        .unwrap();
        assert_eq!(b.hotkey, "CmdOrCtrl+Shift+M");
        assert_eq!(b.action, HotkeyAction::ToggleMute { strip: 0 });
    }
}

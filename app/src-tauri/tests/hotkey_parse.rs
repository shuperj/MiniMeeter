//! Regression tests for the accelerator strings the settings UI produces.
//!
//! The hotkey recorder used to read `KeyboardEvent.key`, which reports "1" for
//! numpad 1 with NumLock on and "End" with it off — so numpad hotkeys silently
//! bound the wrong physical key. It now emits `KeyboardEvent.code` tokens
//! ("Numpad1", "NumpadAdd", ...) for numpad keys. These tests pin down that
//! those tokens really are accepted, and that they are distinct from the
//! main-row digits.

use std::str::FromStr;
use tauri_plugin_global_shortcut::Shortcut;

#[test]
fn numpad_accelerators_parse() {
    let cases = [
        "Numpad0",
        "Numpad1",
        "Numpad9",
        "NumpadAdd",
        "NumpadSubtract",
        "NumpadMultiply",
        "NumpadDivide",
        "NumpadDecimal",
        "NumpadEnter",
        "NumpadEqual",
    ];
    for case in cases {
        assert!(
            Shortcut::from_str(case).is_ok(),
            "expected `{case}` to parse as a shortcut"
        );
    }
}

#[test]
fn numpad_accelerators_parse_with_modifiers() {
    let cases = [
        "CmdOrCtrl+Numpad1",
        "Shift+Numpad5",
        "Alt+NumpadAdd",
        "CmdOrCtrl+Shift+Numpad9",
        "CmdOrCtrl+Shift+Alt+NumpadEnter",
    ];
    for case in cases {
        assert!(
            Shortcut::from_str(case).is_ok(),
            "expected `{case}` to parse as a shortcut"
        );
    }
}

/// The actual bug: recording numpad 1 stored "1", which binds the main-row key.
#[test]
fn numpad_is_distinct_from_digit_row() {
    let numpad = Shortcut::from_str("Numpad1").expect("Numpad1 should parse");
    let digit_row = Shortcut::from_str("1").expect("1 should parse");
    assert_ne!(
        numpad.to_string(),
        digit_row.to_string(),
        "Numpad1 and main-row 1 must be different shortcuts"
    );
}

/// NumLock off makes `KeyboardEvent.key` report "End" for numpad 1.
#[test]
fn numpad_is_distinct_from_navigation_cluster() {
    let numpad = Shortcut::from_str("Numpad1").expect("Numpad1 should parse");
    let end = Shortcut::from_str("End").expect("End should parse");
    assert_ne!(
        numpad.to_string(),
        end.to_string(),
        "Numpad1 and End must be different shortcuts"
    );
}

/// Modifier order shouldn't change the resulting shortcut identity, since the
/// Rust side keys its lookup map on the normalized `to_string()` form.
#[test]
fn modifier_order_normalizes() {
    let a = Shortcut::from_str("CmdOrCtrl+Shift+Numpad3").expect("should parse");
    let b = Shortcut::from_str("Shift+CmdOrCtrl+Numpad3").expect("should parse");
    assert_eq!(a.to_string(), b.to_string());
}

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct AccentColor {
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub hex: String,
    pub contrast_fg: String,
}

impl AccentColor {
    fn new(r: u8, g: u8, b: u8) -> Self {
        let hex = format!("#{:02x}{:02x}{:02x}", r, g, b);
        let luminance = 0.2126 * r as f64 + 0.7152 * g as f64 + 0.0722 * b as f64;
        let contrast_fg = if luminance > 180.0 {
            "#000000".to_string()
        } else {
            "#ffffff".to_string()
        };
        Self { r, g, b, hex, contrast_fg }
    }
}

/// Read the Windows system accent color.
/// Tries UISettings first (handles "automatic" accent), then DwmGetColorizationColor.
pub fn get_system_accent_color() -> AccentColor {
    // Try UISettings (Windows 10+, most accurate)
    if let Some(color) = try_ui_settings() {
        return color;
    }
    // Fallback: DwmGetColorizationColor
    if let Some(color) = try_dwm_colorization() {
        return color;
    }
    // Default blue
    AccentColor::new(58, 134, 255)
}

fn try_ui_settings() -> Option<AccentColor> {
    use windows::UI::ViewManagement::{UIColorType, UISettings};

    let settings = UISettings::new().ok()?;
    let color = settings.GetColorValue(UIColorType::Accent).ok()?;
    Some(AccentColor::new(color.R, color.G, color.B))
}

fn try_dwm_colorization() -> Option<AccentColor> {
    use windows::Win32::Foundation::BOOL;
    use windows::Win32::Graphics::Dwm::DwmGetColorizationColor;

    let mut colorization: u32 = 0;
    let mut opaque_blend = BOOL(0);
    let hr = unsafe { DwmGetColorizationColor(&mut colorization, &mut opaque_blend) };
    if hr.is_ok() {
        let r = ((colorization >> 16) & 0xFF) as u8;
        let g = ((colorization >> 8) & 0xFF) as u8;
        let b = (colorization & 0xFF) as u8;
        Some(AccentColor::new(r, g, b))
    } else {
        None
    }
}

export type AccentSource = "system" | "custom";

/** A named window size the user can snap to from the titlebar. */
export interface WindowPreset {
  name: string;
  width: number;
  height: number;
}

export type BackgroundMode = "solid" | "acrylic" | "visualizer";

/**
 * While the window is unfocused: keep the full frame rate ("animated"), cap it
 * at 60 or 30 fps, or stop.
 */
export type UnfocusedVisualizerMode = "animated" | "60" | "30" | "paused";

/** Caps above the display's refresh rate just draw on every refresh. */
/** Post effect over the visualizer. */
export type VisualizerFilter = "none" | "pixelate" | "crt";

export const VISUALIZER_FPS_OPTIONS = [30, 60, 120, 144, 240] as const;
export type VisualizerFps = (typeof VISUALIZER_FPS_OPTIONS)[number];

export type VisualizerColorSource = "accent" | "custom" | "palette";

export type VisualizerPreset =
  | "xmb-smoke"
  | "starfield"
  | "matrix-rain"
  | "noise-flow"
  | "lava-lamp"
  | "ferrofluid"
  | "disco-ball"
  | "pipes";

export interface BackgroundStyle {
  backgroundMode: BackgroundMode;
  backgroundColor: string;
  backgroundOpacity: number;
  visualizerPreset: VisualizerPreset;
  visualizerOpacity: number;
  /** How strongly the visualizer reacts to audio, 0 - 1 (shown as "Reactivity"). */
  visualizerIntensity: number;
  /** How fast the visualizer moves on its own, 0 - 1; 0.5 is normal speed. */
  visualizerSpeed: number;
  /** Frame rate cap while focused (and while unfocused in "animated" mode). */
  visualizerFps: VisualizerFps;
  visualizerFilter: VisualizerFilter;
  visualizerColorSource: VisualizerColorSource;
  visualizerColor: string;
  /** 2-5 "#rrggbb" colors, used when visualizerColorSource is "palette". */
  visualizerPalette: string[];
  unfocusedVisualizerMode: UnfocusedVisualizerMode;
}

export interface StyleSettings {
  accentSource: AccentSource;
  customAccentColor: string;
  faderColumnWidth: number;
  /**
   * Frosted-glass panel behind each fader, 0 - 1: 0 is fully clear, higher
   * values blur and tint what's behind more (a Mica-like look).
   */
  faderGlass: number;
  background: BackgroundStyle;
  showOutputLevel: boolean;
  /** Keep the window above other windows. Toggled by the titlebar pin. */
  alwaysOnTop: boolean;
  /** Opacity of the entire window, chrome and backdrop included (0.2 - 1). */
  globalOpacity: number;
  /** Named window sizes, reachable by right-clicking the minimize button. */
  windowPresets: WindowPreset[];
}

/** Sized against the 200x275 minimum in tauri.conf.json. */
export const DEFAULT_WINDOW_PRESETS: WindowPreset[] = [
  { name: "Compact", width: 220, height: 300 },
  { name: "Default", width: 420, height: 340 },
  { name: "Tall", width: 420, height: 560 },
];

export const DEFAULT_VISUALIZER_PALETTE = ["#3a86ff", "#ff5e9c", "#ffd166"];

export const DEFAULT_BACKGROUND_STYLE: BackgroundStyle = {
  backgroundMode: "acrylic",
  backgroundColor: "#1e1e1e",
  backgroundOpacity: 1,
  visualizerPreset: "xmb-smoke",
  visualizerOpacity: 0.4,
  visualizerIntensity: 0.5,
  visualizerSpeed: 0.5,
  visualizerFps: 30,
  visualizerFilter: "none",
  visualizerColorSource: "accent",
  visualizerColor: "#3a86ff",
  visualizerPalette: DEFAULT_VISUALIZER_PALETTE,
  unfocusedVisualizerMode: "paused",
};

export const DEFAULT_STYLE_SETTINGS: StyleSettings = {
  accentSource: "system",
  customAccentColor: "#3a86ff",
  faderColumnWidth: 0,
  faderGlass: 1,
  background: { ...DEFAULT_BACKGROUND_STYLE },
  showOutputLevel: false,
  alwaysOnTop: false,
  globalOpacity: 1,
  windowPresets: [...DEFAULT_WINDOW_PRESETS],
};

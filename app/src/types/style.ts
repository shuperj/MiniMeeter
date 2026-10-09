export type AccentSource = "system" | "custom";

/**
 * The title bar's surface: solid accent, frosted glass tinted with the
 * accent (Mica), or frosted glass with no tint.
 */
export type TitlebarStyle = "solid" | "mica" | "clear";

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

/** Post effects over the visualizer; any combination can be on at once. */
export type VisualizerFilter = "pixelate" | "cel" | "crt";
/** Every filter, in the order they are applied. */
export const VISUALIZER_FILTERS: readonly VisualizerFilter[] = ["pixelate", "cel", "crt"];
/** Outline colour for the Cel filter. */
export type CelEdges = "dark" | "light";

/** Caps above the display's refresh rate just draw on every refresh. */

export const VISUALIZER_FPS_OPTIONS = [30, 60, 120, 144, 240] as const;
export type VisualizerFps = (typeof VISUALIZER_FPS_OPTIONS)[number];

export type VisualizerColorSource = "accent" | "custom" | "palette";

/** The Terrain preset's surface: a matte contour map, or one with water in the valleys. */
export type TerrainMaterial = "paper" | "flooded";
/** The Terrain preset's colouring: by height, or a splinter camouflage in the palette. */
export type TerrainPattern = "plain" | "splinter";

export type VisualizerPreset =
  | "xmb-smoke"
  | "starfield"
  | "matrix-rain"
  | "noise-flow"
  | "lava-lamp"
  | "ferrofluid"
  | "liquid-metal"
  | "terrain"
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
  /** Active filters, in application order (see VISUALIZER_FILTERS). */
  visualizerFilters: VisualizerFilter[];
  visualizerCelEdges: CelEdges;
  visualizerColorSource: VisualizerColorSource;
  visualizerColor: string;
  /** 2-5 "#rrggbb" colors, used when visualizerColorSource is "palette". */
  visualizerPalette: string[];
  terrainMaterial: TerrainMaterial;
  terrainPattern: TerrainPattern;
  unfocusedVisualizerMode: UnfocusedVisualizerMode;
  /**
   * Each preset's own strength, reactivity, speed, filters and colours,
   * stashed when switching away from it (see lib/presetStyles). The live
   * fields above always hold the current preset's values.
   */
  presetStyles: Partial<Record<VisualizerPreset, Partial<PresetStyleFields>>>;
}

/** The fields of BackgroundStyle that a preset remembers for itself. */
export interface PresetStyleFields {
  visualizerOpacity: number;
  visualizerIntensity: number;
  visualizerSpeed: number;
  visualizerFilters: VisualizerFilter[];
  visualizerCelEdges: CelEdges;
  visualizerColorSource: VisualizerColorSource;
  visualizerColor: string;
  visualizerPalette: string[];
  terrainMaterial: TerrainMaterial;
  terrainPattern: TerrainPattern;
}

export interface StyleSettings {
  accentSource: AccentSource;
  customAccentColor: string;
  titlebarStyle: TitlebarStyle;
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
  visualizerFilters: [],
  visualizerCelEdges: "dark",
  visualizerColorSource: "accent",
  visualizerColor: "#3a86ff",
  visualizerPalette: DEFAULT_VISUALIZER_PALETTE,
  terrainMaterial: "paper",
  terrainPattern: "plain",
  unfocusedVisualizerMode: "paused",
  presetStyles: {},
};

export const DEFAULT_STYLE_SETTINGS: StyleSettings = {
  accentSource: "system",
  customAccentColor: "#3a86ff",
  titlebarStyle: "solid",
  faderColumnWidth: 0,
  faderGlass: 1,
  background: { ...DEFAULT_BACKGROUND_STYLE },
  showOutputLevel: false,
  alwaysOnTop: false,
  globalOpacity: 1,
  windowPresets: [...DEFAULT_WINDOW_PRESETS],
};

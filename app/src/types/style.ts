export type AccentSource = "system" | "custom";

export type BackgroundMode = "solid" | "acrylic" | "visualizer";

export type UnfocusedVisualizerMode = "animated" | "paused" | "off";

export type VisualizerPreset =
  | "xmb-smoke"
  | "starfield"
  | "matrix-rain"
  | "plasma"
  | "gradient-mesh"
  | "noise-flow"
  | "geometric-pulse";

export interface WindowStateStyle {
  backgroundMode: BackgroundMode;
  backgroundColor: string;
  backgroundOpacity: number;
  acrylicOpacity: number;
  acrylicBlur: number;
  visualizerPreset: VisualizerPreset;
  visualizerOpacity: number;
  visualizerIntensity: number;
}

export interface StyleSettings {
  accentSource: AccentSource;
  customAccentColor: string;
  faderColumnWidth: number;
  focused: WindowStateStyle;
  unfocused: WindowStateStyle;
  unfocusedVisualizerMode: UnfocusedVisualizerMode;
}

export const DEFAULT_WINDOW_STATE_STYLE: WindowStateStyle = {
  backgroundMode: "acrylic",
  backgroundColor: "#1e1e1e",
  backgroundOpacity: 1,
  acrylicOpacity: 0.55,
  acrylicBlur: 0.8,
  visualizerPreset: "xmb-smoke",
  visualizerOpacity: 0.4,
  visualizerIntensity: 0.5,
};

export const DEFAULT_STYLE_SETTINGS: StyleSettings = {
  accentSource: "system",
  customAccentColor: "#3a86ff",
  faderColumnWidth: 0,
  focused: { ...DEFAULT_WINDOW_STATE_STYLE },
  unfocused: {
    ...DEFAULT_WINDOW_STATE_STYLE,
    backgroundMode: "solid",
  },
  unfocusedVisualizerMode: "off",
};

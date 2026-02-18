export type AccentSource = "system" | "custom";

export type BackgroundMode = "solid" | "acrylic" | "visualizer";

export type UnfocusedVisualizerMode = "animated" | "paused";

export type VisualizerColorSource = "accent" | "custom";

export type VisualizerPreset =
  | "xmb-smoke"
  | "starfield"
  | "matrix-rain"
  | "gradient-mesh"
  | "noise-flow"
  | "geometric-pulse";

export interface BackgroundStyle {
  backgroundMode: BackgroundMode;
  backgroundColor: string;
  backgroundOpacity: number;
  visualizerPreset: VisualizerPreset;
  visualizerOpacity: number;
  visualizerIntensity: number;
  visualizerColorSource: VisualizerColorSource;
  visualizerColor: string;
  unfocusedVisualizerMode: UnfocusedVisualizerMode;
}

export interface StyleSettings {
  accentSource: AccentSource;
  customAccentColor: string;
  faderColumnWidth: number;
  background: BackgroundStyle;
  showOutputLevel: boolean;
}

export const DEFAULT_BACKGROUND_STYLE: BackgroundStyle = {
  backgroundMode: "acrylic",
  backgroundColor: "#1e1e1e",
  backgroundOpacity: 1,
  visualizerPreset: "xmb-smoke",
  visualizerOpacity: 0.4,
  visualizerIntensity: 0.5,
  visualizerColorSource: "accent",
  visualizerColor: "#3a86ff",
  unfocusedVisualizerMode: "paused",
};

export const DEFAULT_STYLE_SETTINGS: StyleSettings = {
  accentSource: "system",
  customAccentColor: "#3a86ff",
  faderColumnWidth: 0,
  background: { ...DEFAULT_BACKGROUND_STYLE },
  showOutputLevel: false,
};

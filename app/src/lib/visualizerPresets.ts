import type { VisualizerPreset } from "../types/style";

/**
 * Presets that react to real frequency data. Spectrum capture runs only while
 * one of these is showing, so every other preset costs nothing extra.
 */
const SPECTRUM_PRESETS: ReadonlySet<VisualizerPreset> = new Set<VisualizerPreset>([
  "xmb-smoke",
  "starfield",
  "matrix-rain",
  "gradient-mesh",
  "noise-flow",
  "geometric-pulse",
  "lava-lamp",
  "aurora",
  "disco-ball",
  "pipes",
]);

export function usesSpectrum(preset: VisualizerPreset): boolean {
  return SPECTRUM_PRESETS.has(preset);
}

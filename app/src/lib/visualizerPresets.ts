import type { VisualizerPreset } from "../types/style";

/** Display name of every preset (the type makes this list exhaustive). */
export const PRESET_LABELS: Record<VisualizerPreset, string> = {
  "xmb-smoke": "Waves",
  starfield: "Starfield",
  "matrix-rain": "Matrix Rain",
  "noise-flow": "Noise Flow",
  "lava-lamp": "Lava Lamp",
  ferrofluid: "Ferrofluid",
  "liquid-metal": "Liquid Metal",
  terrain: "Terrain",
  "disco-ball": "Disco Ball",
  pipes: "Pipes",
};

/** The preset menu: flat drawings first, then the shaded, three-dimensional ones. */
export const PRESET_GROUPS: readonly { label: string; presets: readonly VisualizerPreset[] }[] = [
  { label: "2D", presets: ["xmb-smoke", "starfield", "matrix-rain", "noise-flow"] },
  { label: "3D", presets: ["lava-lamp", "ferrofluid", "liquid-metal", "terrain", "disco-ball", "pipes"] },
];

/**
 * Presets that react to real frequency data. Spectrum capture runs only while
 * one of these is showing, so every other preset costs nothing extra.
 */
const SPECTRUM_PRESETS: ReadonlySet<VisualizerPreset> = new Set<VisualizerPreset>([
  "xmb-smoke",
  "starfield",
  "matrix-rain",
  "noise-flow",
  "lava-lamp",
  "ferrofluid",
  "liquid-metal",
  "terrain",
  "disco-ball",
  "pipes",
]);

export function usesSpectrum(preset: VisualizerPreset): boolean {
  return SPECTRUM_PRESETS.has(preset);
}

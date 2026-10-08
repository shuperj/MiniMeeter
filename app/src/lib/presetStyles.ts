// Each visualizer preset remembers its own look. The live values stay in the
// BackgroundStyle fields every consumer already reads; switching preset
// stashes the outgoing preset's values in `presetStyles` and restores the
// incoming one's, so Ferrofluid can run with a palette and the Cel filter
// while Waves keeps the accent colour and nothing else.

import type { BackgroundStyle, CelEdges, VisualizerColorSource, VisualizerPreset } from "../types/style";
import { DEFAULT_VISUALIZER_PALETTE } from "../types/style";
import { normalizePalette } from "./color";
import { normalizeFilters } from "./visualizerFilter";
import { PRESET_LABELS } from "./visualizerPresets";

/** The settings a preset keeps for itself; everything else is global. */
export const PRESET_STYLE_KEYS = [
  "visualizerOpacity",
  "visualizerIntensity",
  "visualizerSpeed",
  "visualizerFilters",
  "visualizerCelEdges",
  "visualizerColorSource",
  "visualizerColor",
  "visualizerPalette",
] as const;

export type PresetStyle = Pick<BackgroundStyle, (typeof PRESET_STYLE_KEYS)[number]>;

/** The current preset's own settings, copied out of the style. */
export function presetStyleOf(bg: BackgroundStyle): PresetStyle {
  return {
    visualizerOpacity: bg.visualizerOpacity,
    visualizerIntensity: bg.visualizerIntensity,
    visualizerSpeed: bg.visualizerSpeed,
    visualizerFilters: [...bg.visualizerFilters],
    visualizerCelEdges: bg.visualizerCelEdges,
    visualizerColorSource: bg.visualizerColorSource,
    visualizerColor: bg.visualizerColor,
    visualizerPalette: [...bg.visualizerPalette],
  };
}

/** The style with the current preset's settings stashed under its name. */
export function rememberPreset(bg: BackgroundStyle): BackgroundStyle {
  return { ...bg, presetStyles: { ...bg.presetStyles, [bg.visualizerPreset]: presetStyleOf(bg) } };
}

/**
 * Switch to `next`: remember the current preset's settings, then take up
 * the next one's if it has any, else carry on with what is set.
 */
export function switchPreset(bg: BackgroundStyle, next: VisualizerPreset): BackgroundStyle {
  const remembered = rememberPreset(bg);
  const saved = remembered.presetStyles[next];
  return { ...remembered, visualizerPreset: next, ...(saved ? presetStyleOf({ ...remembered, ...saved }) : {}) };
}

const COLOR_SOURCES: readonly VisualizerColorSource[] = ["accent", "custom", "palette"];
const isUnit = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;

/** A saved per-preset store, cleaned: known presets, known keys, valid values. */
export function normalizePresetStyles(raw: unknown): Partial<Record<VisualizerPreset, Partial<PresetStyle>>> {
  const out: Partial<Record<VisualizerPreset, Partial<PresetStyle>>> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [preset, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!(preset in PRESET_LABELS) || !entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const style: Partial<PresetStyle> = {};
    if (isUnit(e.visualizerOpacity)) style.visualizerOpacity = e.visualizerOpacity;
    if (isUnit(e.visualizerIntensity)) style.visualizerIntensity = e.visualizerIntensity;
    if (isUnit(e.visualizerSpeed)) style.visualizerSpeed = e.visualizerSpeed;
    if (Array.isArray(e.visualizerFilters)) style.visualizerFilters = normalizeFilters(e.visualizerFilters);
    if (e.visualizerCelEdges === "dark" || e.visualizerCelEdges === "light") style.visualizerCelEdges = e.visualizerCelEdges as CelEdges;
    if (COLOR_SOURCES.includes(e.visualizerColorSource as VisualizerColorSource)) style.visualizerColorSource = e.visualizerColorSource as VisualizerColorSource;
    if (typeof e.visualizerColor === "string" && /^#[0-9a-f]{6}$/i.test(e.visualizerColor)) style.visualizerColor = e.visualizerColor;
    if (Array.isArray(e.visualizerPalette)) style.visualizerPalette = normalizePalette(e.visualizerPalette, DEFAULT_VISUALIZER_PALETTE);
    out[preset as VisualizerPreset] = style;
  }
  return out;
}

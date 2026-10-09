import { useState, useEffect, useCallback } from "react";
import { load } from "@tauri-apps/plugin-store";
import type { StyleSettings, BackgroundStyle } from "../types/style";
import { DEFAULT_STYLE_SETTINGS, DEFAULT_BACKGROUND_STYLE, DEFAULT_VISUALIZER_PALETTE, VISUALIZER_FPS_OPTIONS } from "../types/style";
import { normalizePalette } from "../lib/color";
import { normalizeFilters } from "../lib/visualizerFilter";
import { normalizePresetStyles, TERRAIN_MATERIALS, TERRAIN_PATTERNS } from "../lib/presetStyles";

const STYLE_KEY = "style";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Migrate a background style from any older schema */
function migrateBackground(raw: any): BackgroundStyle {
  const bg = { ...DEFAULT_BACKGROUND_STYLE, ...raw };

  // Migrate old acrylic boolean → backgroundMode
  if ("acrylic" in raw) {
    if (raw.acrylic && bg.backgroundMode !== "visualizer") {
      bg.backgroundMode = "acrylic";
    }
    delete bg.acrylic;
  }

  // Drop removed fields
  delete bg.acrylicBlur;
  delete bg.acrylicOpacity;
  delete bg.acrylicTintR;
  delete bg.acrylicTintG;
  delete bg.acrylicTintB;
  delete bg.acrylicTintAlpha;
  delete bg.cssOverlayOpacity;

  // Ensure backgroundOpacity has a default
  if (bg.backgroundOpacity === undefined) {
    bg.backgroundOpacity = 1;
  }

  // Migrate unfocusedVisualizerMode "off" → "paused"
  if (bg.unfocusedVisualizerMode === "off") {
    bg.unfocusedVisualizerMode = "paused";
  }
  // The short-lived 10 fps "low" option became the 30 fps cap.
  if (bg.unfocusedVisualizerMode === "low") {
    bg.unfocusedVisualizerMode = "30";
  }

  // Migrate removed visualizer presets → default
  if (bg.visualizerPreset === "plasma" || bg.visualizerPreset === "color-field") {
    bg.visualizerPreset = "xmb-smoke";
  }
  // Aurora, Geometric Pulse and Gradient Mesh gave way to Ferrofluid.
  if (["aurora", "geometric-pulse", "gradient-mesh"].includes(bg.visualizerPreset)) {
    bg.visualizerPreset = "ferrofluid";
  }

  // The single Filter choice became a set of filters that stack.
  if (!Array.isArray(raw.visualizerFilters) && typeof raw.visualizerFilter === "string") {
    bg.visualizerFilters = [raw.visualizerFilter];
  }
  delete bg.visualizerFilter;
  bg.visualizerFilters = normalizeFilters(bg.visualizerFilters);
  if (bg.visualizerCelEdges !== "light") {
    bg.visualizerCelEdges = "dark";
  }
  if (!VISUALIZER_FPS_OPTIONS.includes(bg.visualizerFps)) {
    bg.visualizerFps = DEFAULT_BACKGROUND_STYLE.visualizerFps;
  }

  bg.visualizerPalette = normalizePalette(bg.visualizerPalette, DEFAULT_VISUALIZER_PALETTE);
  if (!TERRAIN_MATERIALS.includes(bg.terrainMaterial)) bg.terrainMaterial = "paper";
  if (!TERRAIN_PATTERNS.includes(bg.terrainPattern)) bg.terrainPattern = "plain";
  bg.presetStyles = normalizePresetStyles(bg.presetStyles);

  return bg;
}

/** Migrate full StyleSettings from any saved version to the current schema */
function migrateSettings(raw: any): StyleSettings {
  const s = { ...DEFAULT_STYLE_SETTINGS, ...raw };

  // Migrate from old focused/unfocused schema → single background
  if (raw.focused && !raw.background) {
    s.background = migrateBackground(raw.focused);
    // Pull unfocusedVisualizerMode from old top-level field
    if (raw.unfocusedVisualizerMode && raw.unfocusedVisualizerMode !== "off") {
      s.background.unfocusedVisualizerMode = raw.unfocusedVisualizerMode;
    }
  } else if (raw.background) {
    s.background = migrateBackground(raw.background);
  }

  // Clean up old fields
  delete s.focused;
  delete s.unfocused;
  delete s.unfocusedVisualizerMode;

  if (!["solid", "mica", "clear"].includes(s.titlebarStyle)) {
    s.titlebarStyle = "solid";
  }

  return s;
}

/* eslint-enable @typescript-eslint/no-explicit-any */

export function useStyleSettings() {
  const [style, setStyle] = useState<StyleSettings>(DEFAULT_STYLE_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const store = await load("settings.json", { defaults: {}, autoSave: true });
        const saved = await store.get<Record<string, unknown>>(STYLE_KEY);
        if (!cancelled && saved) {
          setStyle(migrateSettings(saved));
        }
      } catch {
        // First run or corrupt store — use defaults
      }
      if (!cancelled) setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const saveStyle = useCallback(async (next: StyleSettings) => {
    setStyle(next);
    try {
      const store = await load("settings.json", { defaults: {}, autoSave: true });
      await store.set(STYLE_KEY, next);
    } catch {
      // Non-critical
    }
  }, []);

  return { style, saveStyle, loaded };
}

import { useState, useEffect, useCallback } from "react";
import { load } from "@tauri-apps/plugin-store";
import type { StyleSettings, BackgroundStyle } from "../types/style";
import { DEFAULT_STYLE_SETTINGS, DEFAULT_BACKGROUND_STYLE } from "../types/style";

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

  // Migrate removed visualizer presets → default
  if (bg.visualizerPreset === "plasma") {
    bg.visualizerPreset = "xmb-smoke";
  }

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

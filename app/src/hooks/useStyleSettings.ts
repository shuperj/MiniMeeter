import { useState, useEffect, useCallback } from "react";
import { load } from "@tauri-apps/plugin-store";
import type { StyleSettings, WindowStateStyle } from "../types/style";
import { DEFAULT_STYLE_SETTINGS, DEFAULT_WINDOW_STATE_STYLE } from "../types/style";

const STYLE_KEY = "style";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Migrate a WindowStateStyle from the old schema (acrylic boolean) to the new one */
function migrateWindowState(raw: any): WindowStateStyle {
  const ws = { ...DEFAULT_WINDOW_STATE_STYLE, ...raw };

  // Migrate old acrylic boolean → backgroundMode
  if ("acrylic" in raw) {
    if (raw.acrylic && ws.backgroundMode !== "visualizer") {
      ws.backgroundMode = "acrylic";
    }
    delete ws.acrylic;
  }

  // Ensure backgroundOpacity has a default
  if (ws.backgroundOpacity === undefined) {
    ws.backgroundOpacity = 1;
  }

  return ws;
}

/** Migrate full StyleSettings from any saved version to the current schema */
function migrateSettings(raw: any): StyleSettings {
  const s = { ...DEFAULT_STYLE_SETTINGS, ...raw };

  if (raw.focused) {
    s.focused = migrateWindowState(raw.focused);
  }
  if (raw.unfocused) {
    s.unfocused = migrateWindowState(raw.unfocused);
  }
  if (s.unfocusedVisualizerMode === undefined) {
    s.unfocusedVisualizerMode = "off";
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

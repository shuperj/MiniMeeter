import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AccentSource } from "../types/style";

interface AccentColor {
  r: number;
  g: number;
  b: number;
  hex: string;
  contrast_fg: string;
}

const DEFAULT_ACCENT: AccentColor = {
  r: 58, g: 134, b: 255,
  hex: "#3a86ff",
  contrast_fg: "#ffffff",
};

function hexToAccent(hex: string): AccentColor {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16) || 0;
  const g = parseInt(h.substring(2, 4), 16) || 0;
  const b = parseInt(h.substring(4, 6), 16) || 0;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return {
    r, g, b,
    hex: `#${h.padEnd(6, "0")}`,
    contrast_fg: luminance > 180 ? "#000000" : "#ffffff",
  };
}

export function useAccentColor(source: AccentSource, customColor: string) {
  const [accent, setAccent] = useState<AccentColor>(DEFAULT_ACCENT);

  // System accent: fetch from Rust on mount + listen for changes
  useEffect(() => {
    if (source !== "system") return;

    invoke<AccentColor>("get_accent_color")
      .then((color) => {
        setAccent(color);
        applyToCSS(color);
      })
      .catch(() => applyToCSS(DEFAULT_ACCENT));

    const unlisten = listen<AccentColor>("theme:accent-changed", (event) => {
      setAccent(event.payload);
      applyToCSS(event.payload);
    });

    return () => { unlisten.then((fn) => fn()); };
  }, [source]);

  // Custom accent: derive from hex client-side
  useEffect(() => {
    if (source !== "custom") return;
    const color = hexToAccent(customColor);
    setAccent(color);
    applyToCSS(color);
  }, [source, customColor]);

  return accent;
}

function applyToCSS(color: AccentColor) {
  const root = document.documentElement;
  root.style.setProperty("--accent", color.hex);
  root.style.setProperty("--accent-fg", color.contrast_fg);
  root.style.setProperty("--accent-r", String(color.r));
  root.style.setProperty("--accent-g", String(color.g));
  root.style.setProperty("--accent-b", String(color.b));
}

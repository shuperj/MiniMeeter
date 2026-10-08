// The Ferrofluid visualizer's lights, from the visualizer palette. The fluid
// itself is black; every color on screen is a light it reflects, so the
// palette colors become the lights, in order: key, fill, sky, rim, ceiling.
// A single color lights one side only (a key light and nothing from the
// other side); a palette adds a fill from the far side with its second color,
// and so on.

import { parseRgb, type Rgb } from "./color";

/** A color as 0..1 components. */
export type Rgb01 = [number, number, number];

export interface FerroLights {
  /** Key light, upper left, in front. */
  key: Rgb01;
  /** Fill light, lower right, behind; black when there is no second color. */
  fill: Rgb01;
  /** Tint of the sky the fluid reflects. */
  sky: Rgb01;
  /** Rim light from behind, upper right; black unless there is a fourth color. */
  rim: Rgb01;
  /** The bright window band reflected on surfaces facing the viewer. */
  window: Rgb01;
  /** A soft light from above, reflected on surfaces facing up. */
  ceiling: Rgb01;
  /** The body's own faint tint. */
  base: Rgb01;
}

const OFF: Rgb01 = [0, 0, 0];

const unit = (c: Rgb): Rgb01 => [c[0] / 255, c[1] / 255, c[2] / 255];
const scale = (c: Rgb01, k: number): Rgb01 => [c[0] * k, c[1] * k, c[2] * k];
const lighten = (c: Rgb01, t: number): Rgb01 => [c[0] + (1 - c[0]) * t, c[1] + (1 - c[1]) * t, c[2] + (1 - c[2]) * t];

/** Lights for a palette of "r,g,b" strings (one entry for a single color). */
export function ferroLights(palette: readonly string[]): FerroLights {
  const colors = palette.map((p) => unit(parseRgb(p)));
  const key = colors[0];
  const window = lighten(key, 0.55);
  return {
    key,
    fill: colors.length > 1 ? scale(colors[1], 0.8) : OFF,
    sky: scale(colors.length > 2 ? colors[2] : key, 0.3),
    rim: colors.length > 3 ? scale(colors[3], 0.7) : OFF,
    window,
    ceiling: colors.length > 4 ? lighten(colors[4], 0.3) : window,
    base: scale(key, 0.12),
  };
}

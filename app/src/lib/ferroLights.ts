// The Ferrofluid visualizer's colours, from the visualizer palette. The
// palette colours take these roles in order: the fluid itself, the light
// from the right, the shadow side on the left, the highlights, and a rim
// light from behind. A single colour is the fluid, lit from the right by a
// neutral light, with shadows a darker shade of itself.

import { parseRgb, type Rgb } from "./color";

/** A colour as 0..1 components. */
export type Rgb01 = [number, number, number];

export interface FerroLights {
  /** The fluid's own colour. */
  fluid: Rgb01;
  /** The light from the right: the lit side takes on this colour. */
  light: Rgb01;
  /** The shadow side on the left, and the valleys between spikes. */
  shadow: Rgb01;
  /** Specular hotspots and the reflected window band. */
  highlight: Rgb01;
  /** Rim light from behind and above; black (off) without a fifth colour. */
  rim: Rgb01;
}

const WHITE: Rgb01 = [1, 1, 1];
const OFF: Rgb01 = [0, 0, 0];

const unit = (c: Rgb): Rgb01 => [c[0] / 255, c[1] / 255, c[2] / 255];
const scale = (c: Rgb01, k: number): Rgb01 => [c[0] * k, c[1] * k, c[2] * k];

/** Lights for a palette of "r,g,b" strings (one entry for a single colour). */
export function ferroLights(palette: readonly string[]): FerroLights {
  const colors = palette.map((p) => unit(parseRgb(p)));
  const fluid = colors[0];
  return {
    fluid,
    light: colors[1] ?? WHITE,
    shadow: colors[2] ?? scale(fluid, 0.45),
    highlight: colors[3] ?? WHITE,
    rim: colors[4] ?? OFF,
  };
}

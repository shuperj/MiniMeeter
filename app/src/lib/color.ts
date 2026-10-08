export type Rgb = [number, number, number];

/** Parses the visualizer color string ("r,g,b") into channels. */
export function parseRgb(rgb: string): Rgb {
  const [r, g, b] = rgb.split(",").map((v) => parseInt(v) || 0);
  return [r ?? 0, g ?? 0, b ?? 0];
}

const clamp255 = (v: number) => Math.round(Math.min(255, Math.max(0, v)));

/**
 * Rotates a color's hue by `deg`, keeping its luminance — the same matrix as
 * the CSS hue-rotate() filter. Used to derive companion colors from the
 * single visualizer color.
 */
export function hueRotate([r, g, b]: Rgb, deg: number): Rgb {
  const a = (deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return [
    clamp255(
      r * (0.213 + cos * 0.787 - sin * 0.213) +
      g * (0.715 - cos * 0.715 - sin * 0.715) +
      b * (0.072 - cos * 0.072 + sin * 0.928),
    ),
    clamp255(
      r * (0.213 - cos * 0.213 + sin * 0.143) +
      g * (0.715 + cos * 0.285 + sin * 0.14) +
      b * (0.072 - cos * 0.072 - sin * 0.283),
    ),
    clamp255(
      r * (0.213 - cos * 0.213 - sin * 0.787) +
      g * (0.715 - cos * 0.715 + sin * 0.715) +
      b * (0.072 + cos * 0.928 + sin * 0.072),
    ),
  ];
}

/**
 * `count` versions of a color from fully saturated down to `minSaturation`,
 * each keeping the color's brightness. Lets a visualizer vary its particles
 * while staying on the one visualizer color.
 */
export function saturationShades(rgb: Rgb, count: number, minSaturation: number): Rgb[] {
  const [r, g, b] = rgb;
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  const shades: Rgb[] = [];
  for (let i = 0; i < count; i++) {
    const s = count === 1 ? 1 : 1 - ((1 - minSaturation) * i) / (count - 1);
    shades.push([
      clamp255(luma + (r - luma) * s),
      clamp255(luma + (g - luma) * s),
      clamp255(luma + (b - luma) * s),
    ]);
  }
  return shades;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** "#rrggbb" to channels; black for anything else. */
export function hexToRgb(hex: string): Rgb {
  if (!HEX.test(hex)) return [0, 0, 0];
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const PALETTE_MIN = 2;
export const PALETTE_MAX = 5;

/**
 * A saved visualizer palette cleaned up: valid "#rrggbb" entries only, at
 * most PALETTE_MAX of them, or `fallback` if fewer than PALETTE_MIN survive.
 */
export function normalizePalette(raw: unknown, fallback: string[]): string[] {
  if (!Array.isArray(raw)) return fallback;
  const colors = raw.filter((c): c is string => typeof c === "string" && HEX.test(c));
  return colors.length >= PALETTE_MIN ? colors.slice(0, PALETTE_MAX) : fallback;
}

/**
 * Colors for a visualizer with several parts (pipes, arcs, tiles). A user
 * palette is used as is; a single color yields `count` shades of that color —
 * lighter, darker and softer — so a chosen color is always respected.
 */
export function colorVariants(palette: Rgb[], count: number): Rgb[] {
  if (palette.length > 1) return palette;
  const base = palette[0] ?? [255, 255, 255];
  const mix = (c: Rgb, to: number, t: number): Rgb =>
    c.map((v) => clamp255(v + (to - v) * t)) as Rgb;
  const variants: Rgb[] = [
    base,
    mix(base, 255, 0.35),
    mix(base, 0, 0.35),
    saturationShades(base, 2, 0.45)[1],
    mix(base, 255, 0.6),
  ];
  return variants.slice(0, Math.max(1, count));
}

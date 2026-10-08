export interface Metaball {
  x: number;
  y: number;
  r: number;
  /**
   * Optional stretch along each axis (default 1). sy > 1 makes a tall,
   * elongated blob — rising wax — and sx < 1 thins it to keep its volume.
   */
  sx?: number;
  sy?: number;
  /**
   * Absolute center softening (squared distance added to d²), overriding
   * `softness · r²`. A small ball riding on a big one (a tail) needs softening
   * on the big one's scale, or its tiny core shows as a sharp spike.
   */
  soft?: number;
}

/** Field value and its gradient at one point. */
export interface MetaballSample {
  f: number;
  gx: number;
  gy: number;
}

/** Keeps the field finite at a ball's exact center. */
const MIN_DIST_SQ = 1e-6;

/**
 * Classic metaball field: the sum of r²/d² over all balls. It is exactly 1 at
 * a lone ball's radius, so "f >= 1" is the blob surface, and nearby balls add
 * up across the gap between them and merge. The gradient comes out of the
 * same pass, for shading the surface. Writes into `out` so a per-pixel loop
 * allocates nothing. If `contrib` is given, each ball's own share of the
 * field is written to it too, for blending per-ball colors.
 *
 * `softness` rounds off the infinite spike at each ball's center, r²/(d² +
 * softness·r²): at full resolution that spike shows up as a seam in the
 * shading. 0 is the classic field.
 */
export function sampleMetaballs(
  x: number,
  y: number,
  balls: readonly Metaball[],
  out: MetaballSample,
  contrib?: Float32Array,
  softness = 0,
): MetaballSample {
  let f = 0;
  let gx = 0;
  let gy = 0;
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    // Distances measured in the ball's stretched frame.
    const isx = 1 / (b.sx ?? 1);
    const isy = 1 / (b.sy ?? 1);
    const dx = (x - b.x) * isx;
    const dy = (y - b.y) * isy;
    const d2 = Math.max(dx * dx + dy * dy + (b.soft ?? softness * b.r * b.r), MIN_DIST_SQ);
    const c = (b.r * b.r) / d2;
    f += c;
    if (contrib) contrib[i] = c;
    // d/dx of r²/d² is -2·r²·dx/d⁴, times the frame's scale (chain rule).
    const k = (-2 * c) / d2;
    gx += k * dx * isx;
    gy += k * dy * isy;
  }
  out.f = f;
  out.gx = gx;
  out.gy = gy;
  return out;
}

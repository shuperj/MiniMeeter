/**
 * Geometry, drag maths and layout for the rotary knob channel control.
 *
 * Angles are degrees clockwise from east (SVG's y-down convention). The dial
 * sweeps 270°, from lower-left (minimum) over the top to lower-right
 * (maximum), leaving the 90° gap at the bottom.
 */

export const KNOB_START = 135;
export const KNOB_SWEEP = 270;

/** Pointer travel, in px, that turns the knob through its whole range. */
export const DRAG_PX_FULL_SWEEP = 200;
/** Holding Shift slows a drag down to this fraction, for fine adjustment. */
export const FINE_FACTOR = 0.2;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** An SVG arc from `from` to `to` degrees, clockwise. */
export function arcPath(cx: number, cy: number, r: number, from: number, to: number): string {
  const a = polar(cx, cy, r, from);
  const b = polar(cx, cy, r, to);
  const large = to - from > 180 ? 1 : 0;
  const f = (n: number) => n.toFixed(3);
  return `M ${f(a.x)} ${f(a.y)} A ${r} ${r} 0 ${large} 1 ${f(b.x)} ${f(b.y)}`;
}

/** Dial angle for a 0..1 position (0 = minimum). */
export const normToAngle = (n: number) => KNOB_START + clamp01(n) * KNOB_SWEEP;

/** 0..1 position of a dB value within a channel's range (0 = minimum). */
export function dbToNorm(db: number, min: number, max: number): number {
  return max > min ? clamp01((db - min) / (max - min)) : 0;
}

/** dB value for a 0..1 position, rounded to the 0.1 dB the faders use. */
export function normToDb(n: number, min: number, max: number): number {
  return Math.round((min + clamp01(n) * (max - min)) * 10) / 10;
}

/**
 * Position after dragging `dx`, `dy` px from where the drag started. Up and
 * right both turn it up, so either habit works, and nothing jumps on press:
 * the knob only ever moves relative to where it was.
 */
export function dragNorm(startNorm: number, dx: number, dy: number, fine: boolean): number {
  const scale = fine ? FINE_FACTOR : 1;
  return clamp01(startNorm + ((dx - dy) / DRAG_PX_FULL_SWEEP) * scale);
}

export interface KnobGridOptions {
  /** Space between cells, px. */
  gap: number;
  /** Height inside a cell taken by everything but the dial (label, mute, padding), px. */
  chromeHeight: number;
  /** Width inside a cell taken by padding and border, px. */
  chromeWidth: number;
}

/**
 * Columns for `count` knobs in a `width` x `height` area that make each dial
 * as large as possible: one row in a wide window, wrapping into a grid as the
 * window gets narrower or taller. Ties go to fewer rows.
 */
export function knobColumns(width: number, height: number, count: number, opts: KnobGridOptions): number {
  if (count <= 1 || width <= 0 || height <= 0) return Math.max(1, count);
  let best = count;
  let bestDial = -Infinity;
  for (let cols = count; cols >= 1; cols--) {
    const rows = Math.ceil(count / cols);
    // Skip layouts that leave a whole row empty (e.g. 4 knobs in 3 columns
    // and 2 rows is fine, but 5 columns for 4 knobs is not a thing).
    if ((rows - 1) * cols >= count) continue;
    const cellW = (width - opts.gap * (cols - 1)) / cols - opts.chromeWidth;
    const cellH = (height - opts.gap * (rows - 1)) / rows - opts.chromeHeight;
    const dial = Math.min(cellW, cellH);
    if (dial > bestDial + 0.5) {
      bestDial = dial;
      best = cols;
    }
  }
  return best;
}

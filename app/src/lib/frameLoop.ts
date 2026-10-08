// Frame pacing for the background visualizers. They sit behind the mixer, so
// they run at a capped rate (the Frame rate setting) rather than the display's
// refresh rate, and every motion is scaled by elapsed time so speed doesn't
// depend on how often frames actually land.

/** Default frame rate for background visualizers. */
export const VISUALIZER_FPS = 30;

/** Visualizer motion constants were tuned per frame at 60 Hz; dt is in those units. */
const REFERENCE_FRAME_MS = 1000 / 60;

/** Longest gap fed to one step, so a stall (or a resume from pause) doesn't teleport everything. */
const MAX_STEP_MS = 100;

/**
 * Decides, for each display refresh, whether to draw a frame at `fps`.
 * Frames are scheduled from the ideal time rather than the last draw, so the
 * cap averages out exactly on any refresh rate (60 fps on a 144 Hz display
 * really is ~60), and a quarter-frame of slack absorbs timestamp jitter.
 * After a stall it starts afresh instead of bursting to catch up.
 */
export function createFramePacer() {
  let due = -Infinity;
  return (now: number, fps: number): boolean => {
    const interval = 1000 / fps;
    if (now < due - interval * 0.25) return false;
    due = now - due > interval ? now + interval : due + interval;
    return true;
  };
}

/** Elapsed time expressed in 60 Hz frames, clamped to avoid large jumps. */
export function frameDelta(elapsedMs: number): number {
  return Math.min(Math.max(elapsedMs, 0), MAX_STEP_MS) / REFERENCE_FRAME_MS;
}

/**
 * Rescale an alpha that is painted once per frame (a trail-fade overlay, or a
 * glyph re-stamped each frame) so it builds up or fades at the same speed
 * regardless of frame rate: one stamp at dt = 2 equals two stamps at dt = 1.
 * `alphaPerFrame` is the value tuned at 60 Hz; dt is from frameDelta.
 */
export function perFrameAlpha(alphaPerFrame: number, dt: number): number {
  return 1 - Math.pow(1 - alphaPerFrame, dt);
}

/** Bucket index for a 0..1 value, used to batch draw calls that share a style. */
export function bucketOf(value: number, buckets: number): number {
  const i = Math.floor(value * buckets);
  return i < 0 ? 0 : i >= buckets ? buckets - 1 : i;
}

/**
 * Below this, a trail-fade overlay is lost to 8-bit rounding: dim pixels stop
 * fading at all and leave a permanent haze. At high frame rates the per-frame
 * fade gets that small, so it's held back until it adds up to this much.
 */
const MIN_FADE_ALPHA = 0.1;

/**
 * Trail fade that looks the same at any frame rate. Call once per frame with
 * dt; returns the alpha to paint this frame, or 0 to skip until enough time
 * has built up. `alphaPerFrame` is the fade tuned at 60 Hz.
 */
export function createTrailFade(alphaPerFrame: number) {
  let pending = 0;
  return (dt: number): number => {
    pending += dt;
    const alpha = perFrameAlpha(alphaPerFrame, pending);
    if (alpha < MIN_FADE_ALPHA) return 0;
    pending = 0;
    return alpha;
  };
}

/** Chance of an event this frame, for one that happens `perFrame` of the time at 60 Hz. */
export function frameChance(perFrame: number, dt: number): number {
  return perFrameAlpha(Math.min(1, Math.max(0, perFrame)), dt);
}


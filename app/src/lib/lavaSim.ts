// A small physical model of a lava lamp, for the Lava Lamp visualizer.
//
// Real lamps look slow and syrupy, never bouncy, because of three things:
//  - Weak buoyancy. The wax is almost exactly as dense as the liquid around
//    it; warming it expands it a little, so it gets slightly lighter.
//  - No inertia to speak of. The liquid is viscous enough that drag balances
//    buoyancy almost at once, so a blob moves at its terminal speed (Stokes
//    drag: speed grows with radius², so big blobs travel faster) and never
//    coasts, overshoots or rebounds.
//  - Heat, with lag. Wax resting in the pool is heated hard by the bulb until
//    it turns buoyant; once it lifts off it only trades heat slowly with the
//    liquid, so it carries that heat up the lamp. At the top the cool cap
//    chills it; it slows, hangs, and sinks back to the pool. Small blobs
//    exchange heat faster than big ones (more surface for their volume).
//
// Positions are 0..1 of the lamp (y = 0 at the top), velocities per 60 Hz
// frame, temperatures 0..1. `dt` is in 60 Hz frames; every rate is
// time-based so the lamp behaves the same at any frame rate.

import { perFrameAlpha } from "./frameLoop";

export interface LavaBlob {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 0..1. Above NEUTRAL_TEMP the wax is lighter than the liquid and rises. */
  temp: number;
  /** Size relative to a typical blob (radius scale). */
  size: number;
  /** Drives a slow sideways meander. */
  phase: number;
}

/** Wax at this temperature is exactly as dense as the liquid. */
export const NEUTRAL_TEMP = 0.55;

/** Liquid temperature at the top of the lamp, and at the bottom at bulb = 1. */
const TOP_TEMP = 0.2;
const BOTTOM_TEMP = 0.95;

/**
 * Fraction of the gap to a target temperature closed per 60 Hz frame, for a
 * size-1 blob: slow exchange with the liquid, fast heating in contact with
 * the bulb, and quicker cooling against the cap.
 */
const LIQUID_RATE = 0.0012;
const BULB_RATE = 0.012;
const CAP_RATE = 0.01;
/** Wax in the pool is heated toward this, times bulb power. */
const BULB_TEMP = 1;
/** Below this height the wax is in the pool, against the bulb. */
const POOL_TOP = 0.9;
/** Above this height the wax is against the cool cap. */
const CAP_ZONE = 0.18;
/** Terminal speed per unit of (temp − neutral) × size², per 60 Hz frame. */
const RISE = 0.007;
const MAX_SPEED = 0.005;
/** How quickly velocity settles to the terminal speed: viscous, so fast and without overshoot. */
const VISCOUS = 0.03;

const CEILING = 0.06;
const FLOOR = 0.98;
const WALL_IN = 0.12;
const WALL_LIMIT = 0.06;
/** Pull back from the glass, per unit of distance past WALL_IN. */
const WALL_SPRING = 0.004;
const MEANDER = 0.0003;

export function createBlob(init: { x: number; y: number; size: number; temp: number }): LavaBlob {
  return { ...init, vx: 0, vy: 0, phase: Math.random() * Math.PI * 2 };
}

/**
 * Liquid temperature at height y (0 top .. 1 bottom). The bulb heats the
 * bottom; `bulb` scales its power (1 = normal).
 */
export function liquidTemperature(y: number, bulb: number): number {
  const bottom = TOP_TEMP + (BOTTOM_TEMP - TOP_TEMP) * bulb;
  return TOP_TEMP + (bottom - TOP_TEMP) * y * y;
}

/** Advance every blob by `dt` 60 Hz frames with the bulb at `bulb` power. */
export function stepLava(blobs: LavaBlob[], dt: number, bulb: number): void {
  for (const b of blobs) {
    // Heat exchange; small blobs follow faster.
    const exchange = (target: number, rate: number) => {
      b.temp += (target - b.temp) * perFrameAlpha(Math.min(1, rate / b.size), dt);
    };
    exchange(liquidTemperature(b.y, bulb), LIQUID_RATE);
    if (b.y > POOL_TOP) exchange(BULB_TEMP * bulb, BULB_RATE * bulb);
    if (b.y < CAP_ZONE) exchange(TOP_TEMP, CAP_RATE);

    // Terminal (Stokes) speed from buoyancy: up when warmer than neutral.
    let vtY = -RISE * (b.temp - NEUTRAL_TEMP) * b.size * b.size;
    vtY = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, vtY));
    // Ease to a stop against the cap and the pool rather than hitting them.
    if (vtY < 0) vtY *= Math.min(1, Math.max(0, (b.y - CEILING) / 0.1));
    if (vtY > 0) vtY *= Math.min(1, Math.max(0, (FLOOR - b.y) / 0.08));

    // Sideways: a slow meander, eased back from the glass.
    b.phase += 0.004 * dt;
    let vtX = Math.sin(b.phase) * MEANDER;
    if (b.x < WALL_IN) vtX += (WALL_IN - b.x) * WALL_SPRING / 0.06;
    if (b.x > 1 - WALL_IN) vtX -= (b.x - (1 - WALL_IN)) * WALL_SPRING / 0.06;

    // Viscous: velocity settles onto the terminal speed with no overshoot.
    const settle = perFrameAlpha(VISCOUS, dt);
    b.vx += (vtX - b.vx) * settle;
    b.vy += (vtY - b.vy) * settle;
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    // The glass, cap and floor stop a blob dead; nothing rebounds.
    if (b.x < WALL_LIMIT) { b.x = WALL_LIMIT; b.vx = Math.max(0, b.vx); }
    if (b.x > 1 - WALL_LIMIT) { b.x = 1 - WALL_LIMIT; b.vx = Math.min(0, b.vx); }
    if (b.y < CEILING) { b.y = CEILING; b.vy = Math.max(0, b.vy); }
    if (b.y > FLOOR) { b.y = FLOOR; b.vy = Math.min(0, b.vy); }
  }
}

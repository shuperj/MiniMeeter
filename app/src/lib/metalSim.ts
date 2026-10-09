// A bead of mercury on a black floor, for the Liquid Metal visualizer.
//
// The bead sits at the origin; everything is in "bead units" (a resting bead
// has radius about 0.5 and the floor is y = 0). What breaks off it depends
// on the balance of the spectrum: when the lows dominate a kick, a few big
// drops split off the rim, fly out, land, bounce once, roll back and merge;
// when the highs are loud, the rim atomises into a fine spray of specks that
// fall and vanish. The bead squashes on every kick and the mids ripple its
// skin (the ripple is drawn by the shader; only its strength lives here).
//
// `dt` is in 60 Hz frames; every rate is time-based.

import { perFrameAlpha } from "./frameLoop";

export interface MetalDrop {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  r: number;
  /** Has it bounced on the floor yet (only once)? */
  bounced: boolean;
  /** Has it got clear of the bead yet? Until then it can't merge back. */
  away: boolean;
}

export interface MetalSpeck {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  size: number;
  life: number;
  age: number;
}

export interface MetalState {
  /** The bead's radius; it swells with the level. */
  bodyR: number;
  /** Mode-2 squash of the bead: positive = wider than tall. */
  squish: number;
  squishV: number;
  /** Strength of the skin ripple, 0..~2. */
  ripple: number;
  drops: MetalDrop[];
  specks: MetalSpeck[];
  /** Spray owed but not yet spawned (fractional specks per frame). */
  spray: number;
  kicked: boolean;
  time: number;
}

export interface MetalDrive {
  level: number;
  bass: number;
  mid: number;
  treble: number;
  onset: number;
  reactivity: number;
}

export const MAX_DROPS = 12;
export const MAX_SPECKS = 600;
/** The bead's centre sits this far up, as a fraction of its radius. */
export const BODY_HEIGHT = 0.72;
/** The bead is a flattened ellipsoid: scale per axis at rest. */
export const BODY_SCALE: readonly [number, number, number] = [1.15, 0.78, 1.15];
const GRAVITY = 6.5;
const SQUISH_OMEGA = Math.PI * 2 * 2.2;
const SQUISH_DAMPING = 0.28;
const SQUISH_KICK = 1.3;
const MAX_SQUISH = 0.15;

export function createMetal(): MetalState {
  return { bodyR: 0.5, squish: 0, squishV: 0, ripple: 0, drops: [], specks: [], spray: 0, kicked: false, time: 0 };
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** A point on the bead's rim at angle `a`, `lift` above its equator. */
function rimPoint(state: MetalState, a: number, lift: number): [number, number, number] {
  return [Math.cos(a) * state.bodyR * 1.05, state.bodyR * BODY_HEIGHT + lift, Math.sin(a) * state.bodyR * 1.05];
}

function spawnDrop(state: MetalState, bassShare: number, R: number, random: () => number): void {
  if (state.drops.length >= MAX_DROPS) return;
  const a = random() * Math.PI * 2;
  const speed = (0.9 + random() * 0.9) * (0.7 + 0.5 * R);
  const [x, y, z] = rimPoint(state, a, (random() - 0.3) * 0.15);
  state.drops.push({
    x, y, z,
    vx: Math.cos(a) * speed, vy: 0.5 + random() * 0.9, vz: Math.sin(a) * speed * 0.8,
    r: (0.07 + random() * 0.09) * (0.6 + 0.7 * bassShare),
    bounced: false, away: false,
  });
}

function spawnSpeck(state: MetalState, treble: number, random: () => number): void {
  if (state.specks.length >= MAX_SPECKS) return;
  const a = random() * Math.PI * 2;
  const speed = (0.6 + random() * 1.6) * (0.8 + treble);
  const [x, y, z] = rimPoint(state, a, (random() - 0.5) * 0.3 * state.bodyR);
  state.specks.push({
    x, y, z,
    vx: Math.cos(a) * speed, vy: -0.1 + random() * 0.9, vz: Math.sin(a) * speed * 0.8,
    size: 0.012 + random() * 0.022, life: 0.35 + random() * 0.5, age: 0,
  });
}

/** Advance the bead by `dt` 60 Hz frames. */
export function stepMetal(state: MetalState, dt: number, drive: MetalDrive, random: () => number = Math.random): void {
  const R = drive.reactivity;
  const seconds = dt / 60;
  state.time += seconds;
  state.bodyR += (0.46 + 0.12 * drive.level * R - state.bodyR) * perFrameAlpha(0.1, dt);
  state.ripple += ((drive.mid * 0.4 + drive.treble * 0.9) * R - state.ripple) * perFrameAlpha(0.3, dt);

  // Lows throw a few big drops; highs atomise the rim into spray.
  const bassShare = clamp((drive.bass * 1.3) / (drive.bass * 1.3 + drive.treble * 1.5 + 0.03), 0, 1);
  const kicking = drive.onset > 0.5;
  if (kicking && !state.kicked) {
    const big = Math.round(bassShare * (1.5 + random() * 2.5) * R);
    for (let i = 0; i < big; i++) spawnDrop(state, bassShare, R, random);
    const burst = Math.round((1 - bassShare) * drive.treble * R * 90);
    for (let i = 0; i < burst; i++) spawnSpeck(state, drive.treble * R, random);
    state.squishV += SQUISH_KICK * drive.onset * R;
  }
  state.kicked = kicking;
  state.spray += Math.pow(drive.treble * R, 2) * 280 * seconds;
  while (state.spray >= 1) {
    spawnSpeck(state, drive.treble * R, random);
    state.spray -= 1;
  }

  // The squash spring, in small steps.
  const steps = Math.max(1, Math.ceil(seconds / 0.004));
  const h = seconds / steps;
  for (let s = 0; s < steps; s++) {
    state.squishV += (-SQUISH_OMEGA * SQUISH_OMEGA * state.squish - 2 * SQUISH_DAMPING * SQUISH_OMEGA * state.squishV) * h;
    state.squish += state.squishV * h;
  }

  const centreY = state.bodyR * BODY_HEIGHT;
  for (let i = state.drops.length - 1; i >= 0; i--) {
    const d = state.drops[i];
    d.vy -= GRAVITY * seconds;
    d.x += d.vx * seconds; d.y += d.vy * seconds; d.z += d.vz * seconds;
    if (d.y < d.r) {
      d.y = d.r;
      if (!d.bounced && d.vy < -0.5) { d.vy = -d.vy * 0.3; d.bounced = true; }
      else d.vy = 0;
    }
    if (d.y <= d.r + 0.001) {
      // Rolling: drawn back toward the bead, slowing on the way.
      d.vx += -d.x * 3 * seconds; d.vz += -d.z * 3 * seconds;
      const drag = Math.pow(0.4, seconds);
      d.vx *= drag; d.vz *= drag;
    }
    if (!d.away && Math.hypot(d.x, d.z) > state.bodyR * 1.25) d.away = true;
    const dist = Math.hypot(d.x, d.y - centreY, d.z);
    if ((d.away && dist < state.bodyR * 0.95 + d.r * 0.6) || dist > 6) state.drops.splice(i, 1);
  }
  for (let i = state.specks.length - 1; i >= 0; i--) {
    const s = state.specks[i];
    s.vy -= GRAVITY * seconds;
    s.x += s.vx * seconds; s.y += s.vy * seconds; s.z += s.vz * seconds;
    s.age += seconds;
    if (s.age > s.life || s.y < 0.004) state.specks.splice(i, 1);
  }
}

/** The bead's scale per axis: flattened at rest, squashed sideways by kicks. */
export function metalBodyScale(state: MetalState): [number, number, number] {
  const c = clamp(state.squish, -MAX_SQUISH, MAX_SQUISH);
  return [BODY_SCALE[0] * (1 + c), BODY_SCALE[1] * (1 - 0.8 * c), BODY_SCALE[2] * (1 + 0.3 * c)];
}

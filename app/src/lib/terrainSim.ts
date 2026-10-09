// The land for the Terrain visualizer: the music's recent past as a height
// map. Every ROW_MS a row of band energies is written at the front of a
// ring of rows and the older rows scroll away from the viewer; the GPU
// reads the ring as a texture and shapes the ground from it (terrainGl).
//
// Bands are scattered across the width in a shuffled order, each column with
// its own gain, and a drifting noise field decides where a loud moment piles
// up, so the land is irregular rather than a mirrored spine.

import { perFrameAlpha } from "./frameLoop";

export const ROWS = 64;
export const COLS = 32;
/** Band groups the drive supplies (one per two columns). */
export const GROUPS = 16;
/** Rows in view, newest at the front. */
export const VISIBLE = 48;
/** One row of land per this many milliseconds. */
export const ROW_MS = 80;
/**
 * How much of a new row is this moment's music, the rest carried over from
 * the row before: a sharp kick becomes a hill with a slope, not a wall.
 */
export const ROW_BLEND = 0.5;

export interface TerrainState {
  /** The ring of rows as an RGBA image (height in R), ready for the GPU. */
  image: Uint8Array;
  /** Row index the next row is written at. */
  head: number;
  /** Rows written so far, unwrapped. */
  rows: number;
  /** Milliseconds accrued toward the next row. */
  acc: number;
  /** Rows written since the renderer last uploaded, by index. */
  dirty: number[];
  /** Height scale, following reactivity. */
  amp: number;
  /** Smoothed bass and level, for the water. */
  bass: number;
  level: number;
  time: number;
  /** Which band group each column listens to. */
  order: number[];
  gain: number[];
  seed: number;
}

export interface TerrainDrive {
  /** Energy per band group, low to high, 0..1 (GROUPS of them). */
  groups: ArrayLike<number>;
  bass: number;
  level: number;
  reactivity: number;
}

const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/** Smooth value noise in 0..1, seeded. */
function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const sm = (t: number) => t * t * (3 - 2 * t);
  const h2 = (i: number, j: number) => hash(i * 12.9898 + j * 78.233 + seed);
  return (h2(xi, yi) * (1 - sm(fx)) + h2(xi + 1, yi) * sm(fx)) * (1 - sm(fy))
    + (h2(xi, yi + 1) * (1 - sm(fx)) + h2(xi + 1, yi + 1) * sm(fx)) * sm(fy);
}

export function createTerrain(random: () => number = Math.random): TerrainState {
  // Every group twice, shuffled.
  const order = Array.from({ length: COLS }, (_, c) => c % GROUPS);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    image: new Uint8Array(ROWS * COLS * 4),
    head: 0, rows: 0, acc: ROW_MS * random(), dirty: [],
    amp: 0, bass: 0, level: 0, time: 0,
    order,
    gain: Array.from({ length: COLS }, () => 0.55 + random() * 0.8),
    seed: random() * 1000,
  };
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Write the land this moment's music makes into row `row` of the ring. */
function writeRow(state: TerrainState, row: number, drive: TerrainDrive): void {
  const raw = new Float32Array(COLS);
  for (let c = 0; c < COLS; c++) {
    // A drifting field of weights decides where this moment's energy lands.
    const w = 0.35 + 1.0 * valueNoise(c * 0.33, state.rows * 0.09, state.seed);
    raw[c] = Math.pow(drive.groups[state.order[c]] ?? 0, 1.2) * state.gain[c] * w;
  }
  const at = (i: number) => raw[clamp(i, 0, COLS - 1)];
  const base = row * COLS * 4;
  // The row before this one (the newest landed), to blend with.
  const prevBase = state.rows > 0 ? newestRow(state) * COLS * 4 : -1;
  for (let c = 0; c < COLS; c++) {
    // A wide footprint per band across the width, so hills are as wide as they are long.
    const now = (at(c - 2) + 2 * at(c - 1) + 3 * raw[c] + 2 * at(c + 1) + at(c + 2)) / 9;
    const prev = prevBase >= 0 ? state.image[prevBase + c * 4] / 255 : now;
    const v = prev + (now - prev) * ROW_BLEND;
    const byte = clamp(Math.round(v * 255), 0, 255);
    state.image[base + c * 4] = byte;
    state.image[base + c * 4 + 1] = byte;
    state.image[base + c * 4 + 2] = byte;
    state.image[base + c * 4 + 3] = 255;
  }
  if (!state.dirty.includes(row)) state.dirty.push(row);
}

function pushRow(state: TerrainState, drive: TerrainDrive): void {
  writeRow(state, state.head, drive);
  state.head = (state.head + 1) % ROWS;
  state.rows++;
}

/**
 * Advance by `dt` 60 Hz frames, laying down rows as time accrues. The slot
 * ahead of the newest row always holds this moment's live values, so the
 * front edge of the land flows toward the row about to land instead of
 * stepping when it does.
 */
export function stepTerrain(state: TerrainState, dt: number, drive: TerrainDrive): void {
  const R = drive.reactivity;
  state.time += dt / 60;
  state.amp += (0.7 * R - state.amp) * perFrameAlpha(0.05, dt);
  state.bass += (drive.bass * R - state.bass) * perFrameAlpha(0.3, dt);
  state.level += (drive.level * R - state.level) * perFrameAlpha(0.02, dt);
  state.acc += (dt * 1000) / 60;
  while (state.acc >= ROW_MS) {
    pushRow(state, drive);
    state.acc -= ROW_MS;
  }
  writeRow(state, state.head, drive);
}

/** Index of the newest row in the ring. */
export function newestRow(state: TerrainState): number {
  return (state.head - 1 + ROWS) % ROWS;
}

/** How far the newest row has slid back toward the next one, 0..1. */
export function rowFraction(state: TerrainState): number {
  return state.acc / ROW_MS;
}

/**
 * The flooded material's water level: quiet floods the valleys, loud lifts
 * the land, with a slow swell on top.
 */
export function waterLevel(state: TerrainState): number {
  return 0.17 - 0.12 * state.level + 0.025 * Math.sin(state.time * 0.7);
}

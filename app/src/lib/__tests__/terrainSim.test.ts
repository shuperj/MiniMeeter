import { describe, it, expect } from "vitest";
import { createTerrain, stepTerrain, newestRow, rowFraction, waterLevel, ROWS, COLS, GROUPS, ROW_MS, type TerrainDrive } from "../terrainSim";

function seeded(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const drive = (over: Partial<TerrainDrive> = {}): TerrainDrive => ({ groups: new Float32Array(GROUPS), bass: 0, level: 0, reactivity: 1, ...over });
const rowBytes = (image: Uint8Array, row: number) => Array.from(image.subarray(row * COLS * 4, (row + 1) * COLS * 4)).filter((_, i) => i % 4 === 0);

describe("createTerrain", () => {
  it("gives every band group two columns, shuffled", () => {
    const state = createTerrain(seeded(1));
    const counts = new Array(GROUPS).fill(0);
    for (const g of state.order) counts[g]++;
    expect(counts.every((n) => n === 2)).toBe(true);
    expect(state.order.join()).not.toBe(Array.from({ length: COLS }, (_, c) => c % GROUPS).join());
  });
});

describe("stepTerrain", () => {
  it("lays down a row every 80 ms", () => {
    const state = createTerrain(seeded(2));
    for (let i = 0; i < 60; i++) stepTerrain(state, 1, drive());
    expect(state.rows).toBeGreaterThanOrEqual(Math.floor(1000 / ROW_MS));
    expect(state.rows).toBeLessThanOrEqual(Math.ceil(1000 / ROW_MS));
    expect(state.dirty).toHaveLength(state.rows);
    expect(newestRow(state)).toBe(state.rows - 1);
    expect(rowFraction(state)).toBeGreaterThanOrEqual(0);
    expect(rowFraction(state)).toBeLessThan(1);
  });

  it("raises the columns of a loud group above the rest", () => {
    const state = createTerrain(seeded(3));
    const groups = new Float32Array(GROUPS);
    groups[5] = 1;
    stepTerrain(state, ROW_MS / (1000 / 60) + 1, drive({ groups }));
    expect(state.rows).toBeGreaterThan(0);
    const row = rowBytes(state.image, newestRow(state));
    const loudCols = state.order.map((g, c) => (g === 5 ? c : -1)).filter((c) => c >= 0);
    const loudest = Math.max(...loudCols.map((c) => row[c]));
    const others = row.filter((_, c) => !loudCols.some((l) => Math.abs(l - c) <= 2));
    expect(loudest).toBeGreaterThan(Math.max(...others));
    expect(Math.max(...others)).toBe(0);
  });

  it("wraps the ring and keeps the newest row index right", () => {
    const state = createTerrain(seeded(4));
    for (let i = 0; i < 60 * 8; i++) stepTerrain(state, 1, drive());
    expect(state.rows).toBeGreaterThan(ROWS);
    expect(newestRow(state)).toBe((state.rows - 1) % ROWS);
    expect(state.head).toBe(state.rows % ROWS);
  });

  it("writes the same rows at 30 and 144 fps for the same music", () => {
    const groups = new Float32Array(GROUPS).map((_, g) => (g % 3) / 3);
    const a = createTerrain(seeded(5));
    const b = createTerrain(seeded(5));
    for (const [state, dt] of [[a, 2], [b, 60 / 144]] as const) {
      const steps = Math.round((2 * 60) / dt);
      for (let i = 0; i < steps; i++) stepTerrain(state, dt, drive({ groups, bass: 0.5, level: 0.5 }));
    }
    expect(Math.abs(a.rows - b.rows)).toBeLessThanOrEqual(1);
    for (let r = 0; r < Math.min(a.rows, b.rows); r++) expect(rowBytes(a.image, r)).toEqual(rowBytes(b.image, r));
    expect(a.level).toBeCloseTo(b.level, 2);
  });
});

describe("waterLevel", () => {
  it("floods the valleys in silence and lifts the land when it is loud", () => {
    const quiet = createTerrain(seeded(6));
    const loud = createTerrain(seeded(6));
    for (let i = 0; i < 600; i++) {
      stepTerrain(quiet, 1, drive({ level: 0 }));
      stepTerrain(loud, 1, drive({ level: 1 }));
    }
    expect(waterLevel(quiet)).toBeGreaterThan(waterLevel(loud) + 0.08);
  });
});

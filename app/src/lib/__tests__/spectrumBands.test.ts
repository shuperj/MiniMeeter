import { describe, it, expect } from "vitest";
import { createBandGroups } from "../spectrumBands";

const BANDS = 48;

/** A spectrum with `value` in bands [from, to) and silence elsewhere. */
function spectrumWith(from: number, to: number, value: number) {
  const s = new Float32Array(BANDS);
  for (let b = from; b < to; b++) s[b] = value;
  return s;
}

function run(
  step: ReturnType<typeof createBandGroups>,
  spectrum: Float32Array | null,
  level: number,
  frames: number,
  dt = 2,
) {
  let out = step(spectrum, level, dt);
  for (let i = 1; i < frames; i++) out = step(spectrum, level, dt);
  return out;
}

describe("createBandGroups", () => {
  it("averages bands into evenly split groups, low to high", () => {
    const out = run(createBandGroups(2), spectrumWith(0, 24, 1), 0, 60);
    expect(out.groups[0]).toBeGreaterThan(0.9);
    expect(out.groups[1]).toBeLessThan(0.05);
  });

  it("splits bass, mid and treble by frequency", () => {
    const treble = run(createBandGroups(4), spectrumWith(40, 48, 1), 0, 60);
    expect(treble.treble).toBeGreaterThan(0.9);
    expect(treble.bass).toBeLessThan(0.05);
    const bass = run(createBandGroups(4), spectrumWith(0, 10, 1), 0, 60);
    expect(bass.bass).toBeGreaterThan(0.5);
    expect(bass.treble).toBeLessThan(0.05);
  });

  it("treats quiet bands as nothing", () => {
    const out = run(createBandGroups(3), spectrumWith(0, BANDS, 0.15), 0, 60);
    expect(Math.max(...out.groups)).toBe(0);
  });

  it("falls back to the level when there's no spectrum", () => {
    const out = run(createBandGroups(3), null, 0.6, 300);
    for (const g of out.groups) expect(g).toBeCloseTo(0.6, 1);
    expect(out.bass).toBeCloseTo(0.6, 1);
    expect(out.treble).toBeCloseTo(0.6, 1);
  });

  it("fires an onset on a kick, not on a held bass note", () => {
    const step = createBandGroups(3);
    run(step, spectrumWith(0, 10, 0.1), 0, 60);
    const kick = step(spectrumWith(0, 10, 0.75), 0, 2);
    expect(kick.onset).toBeGreaterThan(0.5);
    const held = run(step, spectrumWith(0, 10, 0.75), 0, 40);
    expect(held.onset).toBeLessThan(0.1);
  });

  it("smooths the same at 30 and 60 fps", () => {
    const at30 = run(createBandGroups(2), spectrumWith(0, 24, 0.6), 0, 6, 2);
    const at60 = run(createBandGroups(2), spectrumWith(0, 24, 0.6), 0, 12, 1);
    expect(at30.groups[0]).toBeCloseTo(at60.groups[0], 2);
  });
});

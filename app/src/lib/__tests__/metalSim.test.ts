import { describe, it, expect } from "vitest";
import { createMetal, stepMetal, metalBodyScale, MAX_DROPS, MAX_SPECKS, BODY_HEIGHT, type MetalDrive, type MetalState } from "../metalSim";

function seeded(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const quiet: MetalDrive = { level: 0, bass: 0, mid: 0, treble: 0, onset: 0, reactivity: 1 };
const drive = (over: Partial<MetalDrive>): MetalDrive => ({ ...quiet, ...over });

function run(state: MetalState, seconds: number, dt: number, d: MetalDrive, random: () => number, each?: () => void) {
  const steps = Math.round((seconds * 60) / dt);
  for (let i = 0; i < steps; i++) { stepMetal(state, dt, d, random); each?.(); }
}

describe("stepMetal", () => {
  it("throws big drops off the rim when the lows dominate a kick", () => {
    const state = createMetal();
    stepMetal(state, 1, drive({ level: 0.8, bass: 0.9, treble: 0.05, onset: 0.9 }), seeded(1));
    expect(state.drops.length).toBeGreaterThanOrEqual(1);
    expect(state.specks.length).toBeLessThan(5);
    for (const d of state.drops) {
      // On the rim, around the bead's equator, heading outward.
      expect(Math.hypot(d.x, d.z)).toBeGreaterThan(state.bodyR * 0.9);
      expect(Math.abs(d.y - state.bodyR * BODY_HEIGHT)).toBeLessThan(0.2);
      expect(d.vx * d.x + d.vz * d.z).toBeGreaterThan(0);
    }
  });

  it("sprays specks instead when the highs dominate", () => {
    const state = createMetal();
    stepMetal(state, 1, drive({ level: 0.8, bass: 0.05, treble: 0.9, onset: 0.9 }), seeded(2));
    expect(state.drops.length).toBe(0);
    expect(state.specks.length).toBeGreaterThan(20);
  });

  it("keeps spraying while the highs stay loud, and the spray dies away in silence", () => {
    const state = createMetal();
    let peak = 0;
    run(state, 1, 1, drive({ treble: 0.8 }), seeded(3), () => { peak = Math.max(peak, state.specks.length); });
    expect(peak).toBeGreaterThan(50);
    run(state, 2, 1, quiet, seeded(4));
    expect(state.specks.length).toBe(0);
  });

  it("lets drops fall, roll back and merge into the bead", () => {
    const state = createMetal();
    const random = seeded(5);
    stepMetal(state, 1, drive({ level: 0.8, bass: 0.9, onset: 0.9 }), random);
    expect(state.drops.length).toBeGreaterThan(0);
    run(state, 5, 1, quiet, random);
    expect(state.drops.length).toBe(0);
  });

  it("kicks once per onset", () => {
    const state = createMetal();
    const random = seeded(6);
    const d = drive({ level: 0.8, bass: 0.9, onset: 0.9 });
    stepMetal(state, 1, d, random);
    const after = state.drops.length;
    stepMetal(state, 1, d, random);
    expect(state.drops.length).toBe(after);
  });

  it("squashes the bead on a kick and settles again", () => {
    const state = createMetal();
    stepMetal(state, 1, drive({ onset: 0.9 }), seeded(7));
    let widest = 0;
    run(state, 0.5, 1, quiet, seeded(8), () => { widest = Math.max(widest, metalBodyScale(state)[0]); });
    expect(widest).toBeGreaterThan(1.15 * 1.03);
    run(state, 3, 1, quiet, seeded(9));
    expect(Math.abs(state.squish)).toBeLessThan(0.005);
  });

  it("never exceeds the drop and speck caps", () => {
    const state = createMetal();
    const random = seeded(10);
    for (let i = 0; i < 300; i++) {
      stepMetal(state, 1, drive({ level: 1, bass: 1, treble: 1, onset: i % 4 === 0 ? 1 : 0, reactivity: 2 }), random);
      expect(state.drops.length).toBeLessThanOrEqual(MAX_DROPS);
      expect(state.specks.length).toBeLessThanOrEqual(MAX_SPECKS);
    }
  });

  it("settles the bead and its squash the same at 30 and 144 fps", () => {
    const a = createMetal();
    const b = createMetal();
    const script = (t: number) => drive({ level: 0.7, mid: 0.5, treble: 0.2, onset: t > 0.5 && t < 0.6 ? 0.9 : 0 });
    for (const [state, dt] of [[a, 2], [b, 60 / 144]] as const) {
      const steps = Math.round((3 * 60) / dt);
      for (let i = 0; i < steps; i++) stepMetal(state, dt, script((i * dt) / 60), seeded(11));
    }
    expect(a.bodyR).toBeCloseTo(b.bodyR, 2);
    expect(a.ripple).toBeCloseTo(b.ripple, 2);
    expect(a.squish).toBeCloseTo(b.squish, 2);
  });
});

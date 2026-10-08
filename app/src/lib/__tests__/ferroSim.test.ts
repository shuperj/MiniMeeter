import { describe, it, expect } from "vitest";
import {
  sphereSites, createFerro, stepFerro, bodyScale,
  SITE_COUNT, FORM_FIELD, COLLAPSE_FIELD, MAX_HEIGHT,
  type FerroDrive, type FerroState,
} from "../ferroSim";

/** A deterministic stand-in for Math.random. */
function seeded(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BANDS = 48;

function drive(over: Partial<FerroDrive> = {}): FerroDrive {
  return { level: 0, bands: new Float32Array(BANDS), onset: 0, reactivity: 1, ...over };
}

function flat(value: number): Float32Array {
  return new Float32Array(BANDS).fill(value);
}

/** Run `seconds` of simulated time in steps of `dt` (60 Hz frames). */
function simulate(state: FerroState, seconds: number, dt: number, d: FerroDrive, each?: (t: number) => void) {
  const steps = Math.round((seconds * 60) / dt);
  for (let i = 0; i < steps; i++) {
    stepFerro(state, dt, d);
    each?.((i * dt) / 60);
  }
}

describe("sphereSites", () => {
  const sites = sphereSites(SITE_COUNT, seeded(1));

  it("spreads the sites evenly over the unit sphere", () => {
    expect(sites).toHaveLength(SITE_COUNT);
    for (const s of sites) {
      expect(Math.hypot(s.x, s.y, s.z)).toBeCloseTo(1, 6);
      let nearest = Infinity;
      for (const t of sites) {
        if (t === s) continue;
        nearest = Math.min(nearest, Math.hypot(t.x - s.x, t.y - s.y, t.z - s.z));
      }
      // Fibonacci spacing for 64 points is about 0.4 (chord); nothing crowds or gaps.
      expect(nearest).toBeGreaterThan(0.25);
      expect(nearest).toBeLessThan(0.6);
    }
  });

  it("listens to the treble at the top of the ball and the bass at the bottom", () => {
    const top = sites.filter((s) => s.y > 0.7);
    const bottom = sites.filter((s) => s.y < -0.7);
    expect(top.length).toBeGreaterThan(0);
    expect(bottom.length).toBeGreaterThan(0);
    for (const s of top) expect(s.bandPos).toBeGreaterThan(0.75);
    for (const s of bottom) expect(s.bandPos).toBeLessThan(0.25);
  });

  it("couples every site to its six nearest neighbours", () => {
    for (const s of sites) {
      expect(s.neighbors).toHaveLength(6);
      expect(s.neighbors).not.toContain(sites.indexOf(s));
    }
  });
});

describe("stepFerro", () => {
  it("forms spikes above the forming field and keeps them until the field drops below the collapse field", () => {
    const state = createFerro(seeded(2));
    // With no magnet, the field at a site is 0.85 x its band.
    const field = (band: number) => band * 0.85;
    expect(field(0.7)).toBeGreaterThan(FORM_FIELD);
    expect(field(0.5)).toBeLessThan(FORM_FIELD);
    expect(field(0.5)).toBeGreaterThan(COLLAPSE_FIELD);
    expect(field(0.3)).toBeLessThan(COLLAPSE_FIELD);

    simulate(state, 1, 1, drive({ bands: flat(0.7) }));
    expect(state.sites.every((s) => s.on)).toBe(true);
    expect(Math.min(...state.sites.map((s) => s.h))).toBeGreaterThan(0.3);

    simulate(state, 1, 1, drive({ bands: flat(0.5) }));
    expect(state.sites.every((s) => s.on)).toBe(true);

    simulate(state, 1, 1, drive({ bands: flat(0.3) }));
    expect(state.sites.every((s) => !s.on)).toBe(true);
    expect(Math.max(...state.sites.map((s) => s.h))).toBeLessThan(0.05);
  });

  it("gathers into a ball with signal and slumps back to a puddle in silence", () => {
    const state = createFerro(seeded(3));
    expect(state.gather).toBe(0);
    simulate(state, 3, 1, drive({ level: 0.6 }));
    expect(state.gather).toBeGreaterThan(0.9);
    simulate(state, 1, 1, drive({ level: 0 }));
    // Slow to relax: still mostly a ball a second later.
    expect(state.gather).toBeGreaterThan(0.6);
    simulate(state, 20, 1, drive({ level: 0 }));
    expect(state.gather).toBeLessThan(0.05);
  });

  it("kicks formed spikes upward once per onset, not every frame the onset is high", () => {
    const state = createFerro(seeded(4));
    simulate(state, 2, 1, drive({ bands: flat(0.7) }));
    const settled = state.sites.map((s) => s.h);
    const velocity = () => state.sites.reduce((sum, s) => sum + s.v, 0);

    const before = velocity();
    stepFerro(state, 1, drive({ bands: flat(0.7), onset: 0.9 }));
    const jump = velocity() - before;
    expect(jump).toBeGreaterThan(SITE_COUNT * 0.5);

    const afterFirst = velocity();
    stepFerro(state, 1, drive({ bands: flat(0.7), onset: 0.9 }));
    expect(velocity() - afterFirst).toBeLessThan(jump * 0.5);

    let peak = 0;
    simulate(state, 0.5, 1, drive({ bands: flat(0.7) }), () => {
      peak = Math.max(peak, ...state.sites.map((s, i) => s.h - settled[i]));
    });
    expect(peak).toBeGreaterThan(0.1);
  });

  it("does not kick spikes that have not formed", () => {
    const state = createFerro(seeded(5));
    stepFerro(state, 1, drive({ onset: 0.9 }));
    expect(state.sites.every((s) => s.v === 0 && s.h === 0)).toBe(true);
  });

  it("turns the ball slowly and keeps the rotated directions on the sphere", () => {
    const state = createFerro(seeded(6));
    const spin0 = state.spin;
    simulate(state, 1, 1, drive());
    expect(state.spin).toBeGreaterThan(spin0);
    expect(state.spin - spin0).toBeLessThan(1);
    for (const s of state.sites) {
      expect(Math.hypot(s.rx, s.ry, s.rz)).toBeCloseTo(1, 6);
      expect(s.ry).toBeCloseTo(s.y, 6);
    }
  });

  it("behaves the same at 30 and 144 fps", () => {
    const a = createFerro(seeded(7));
    const b = createFerro(seeded(7));
    const script = (t: number) => drive({ level: 0.6, bands: flat(t < 2 ? 0.7 : 0.4), onset: t > 1 && t < 1.2 ? 0.9 : 0 });
    for (const [state, dt] of [[a, 2], [b, 60 / 144]] as const) {
      const steps = Math.round((4 * 60) / dt);
      for (let i = 0; i < steps; i++) stepFerro(state, dt, script((i * dt) / 60));
    }
    expect(a.gather).toBeCloseTo(b.gather, 1);
    expect(a.squish).toBeCloseTo(b.squish, 1);
    for (let i = 0; i < SITE_COUNT; i++) expect(a.sites[i].h).toBeCloseTo(b.sites[i].h, 1);
  });

  it("keeps heights within bounds under a rough drive", () => {
    const state = createFerro(seeded(8));
    const rng = seeded(9);
    let maxH = 0;
    let minH = 0;
    for (let i = 0; i < 600; i++) {
      const bands = new Float32Array(BANDS);
      for (let b = 0; b < BANDS; b++) bands[b] = rng();
      stepFerro(state, 1, drive({ level: rng(), bands, onset: rng() > 0.8 ? 1 : 0, reactivity: 2 }));
      for (const s of state.sites) {
        maxH = Math.max(maxH, s.h);
        minH = Math.min(minH, s.h);
      }
    }
    expect(minH).toBeGreaterThanOrEqual(0);
    expect(maxH).toBeLessThan(MAX_HEIGHT * 1.6);
  });
});

describe("bodyScale", () => {
  it("is a wide, flat puddle with no signal and the unit ball when gathered", () => {
    const state = createFerro(seeded(10));
    expect(bodyScale(state)).toEqual([1.5, 0.14, 1.5]);
    state.gather = 1;
    const [x, y, z] = bodyScale(state);
    expect(x).toBeCloseTo(1, 6);
    expect(y).toBeCloseTo(1, 6);
    expect(z).toBeCloseTo(1, 6);
  });

  it("squashes the body wider than tall on a positive squish, within limits", () => {
    const state = createFerro(seeded(11));
    state.gather = 1;
    state.squish = 0.5;
    const [x, y] = bodyScale(state);
    expect(x).toBeCloseTo(1.12, 6);
    expect(y).toBeCloseTo(1 - 0.75 * 0.12, 6);
  });
});

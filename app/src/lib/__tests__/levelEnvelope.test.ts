import { describe, it, expect } from "vitest";
import { createLevelEnvelope } from "../levelEnvelope";

function run(env: ReturnType<typeof createLevelEnvelope>, level: number, frames: number, dt = 2) {
  let out = env(level, dt);
  for (let i = 1; i < frames; i++) out = env(level, dt);
  return out;
}

describe("createLevelEnvelope", () => {
  it("stays at zero in silence", () => {
    const out = run(createLevelEnvelope(), 0, 30);
    expect(out.smooth).toBe(0);
    expect(out.hit).toBe(0);
  });

  it("settles on a steady level with no hit", () => {
    const out = run(createLevelEnvelope(), 0.6, 300);
    expect(out.smooth).toBeCloseTo(0.6, 2);
    expect(out.hit).toBeLessThan(0.01);
  });

  it("fires a hit when the level jumps from quiet", () => {
    const env = createLevelEnvelope();
    run(env, 0.05, 60);
    const out = env(0.8, 2);
    expect(out.hit).toBeGreaterThan(0.5);
  });

  it("lets a hit decay away once the level holds", () => {
    const env = createLevelEnvelope();
    run(env, 0.05, 60);
    const first = env(0.8, 2).hit;
    const later = run(env, 0.8, 30).hit;
    expect(later).toBeLessThan(first * 0.2);
  });

  it("attacks faster than it releases", () => {
    const up = createLevelEnvelope();
    const rise = run(up, 1, 3).smooth;
    const down = createLevelEnvelope();
    run(down, 1, 300);
    const fall = 1 - run(down, 0, 3).smooth;
    expect(rise).toBeGreaterThan(fall);
  });

  it("gives the same result at 30 and 60 fps", () => {
    const a = createLevelEnvelope();
    const b = createLevelEnvelope();
    const at30 = run(a, 0.7, 10, 2);
    const at60 = run(b, 0.7, 20, 1);
    expect(at30.smooth).toBeCloseTo(at60.smooth, 2);
  });
});

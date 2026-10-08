import { describe, it, expect } from "vitest";
import { createBlob, liquidTemperature, stepLava, NEUTRAL_TEMP, type LavaBlob } from "../lavaSim";

/** Run `seconds` of simulated time in steps of `dt` (60 Hz frames). */
function simulate(blobs: LavaBlob[], seconds: number, dt: number, bulb = 1, each?: (t: number) => void) {
  const steps = Math.round((seconds * 60) / dt);
  for (let i = 0; i < steps; i++) {
    stepLava(blobs, dt, bulb);
    each?.(i * dt / 60);
  }
}

describe("liquidTemperature", () => {
  it("is hottest at the bulb and cools toward the top", () => {
    expect(liquidTemperature(1, 1)).toBeGreaterThan(liquidTemperature(0.5, 1));
    expect(liquidTemperature(0.5, 1)).toBeGreaterThan(liquidTemperature(0, 1));
    expect(liquidTemperature(1, 1)).toBeGreaterThan(NEUTRAL_TEMP);
    expect(liquidTemperature(0, 1)).toBeLessThan(NEUTRAL_TEMP);
  });

  it("gets hotter at the bottom with more bulb power", () => {
    expect(liquidTemperature(1, 1.5)).toBeGreaterThan(liquidTemperature(1, 1));
  });
});

describe("stepLava", () => {
  it("warms a blob in the pool until it rises, then it cools near the top and sinks", () => {
    const b = createBlob({ x: 0.5, y: 0.97, size: 1, temp: 0.3 });
    let top = 1;
    let sankAfterTop = false;
    simulate([b], 60, 1, 1, () => {
      top = Math.min(top, b.y);
      if (top < 0.3 && b.y > 0.7) sankAfterTop = true;
    });
    expect(top).toBeLessThan(0.3);
    expect(sankAfterTop).toBe(true);
  });

  it("moves slowly and never bounces: velocity changes smoothly and turns around only gently", () => {
    const b = createBlob({ x: 0.5, y: 0.97, size: 1, temp: 0.3 });
    let maxJump = 0;
    let maxSpeed = 0;
    let prev = b.vy;
    simulate([b], 60, 1, 1, () => {
      maxJump = Math.max(maxJump, Math.abs(b.vy - prev));
      maxSpeed = Math.max(maxSpeed, Math.abs(b.vy));
      prev = b.vy;
    });
    // Takes several seconds to cross the lamp, and no frame-to-frame lurches.
    expect(maxSpeed).toBeLessThan(1 / (3 * 60));
    expect(maxJump).toBeLessThan(maxSpeed * 0.1);
  });

  it("moves bigger blobs faster at the same temperature (Stokes: speed ~ radius²)", () => {
    const small = createBlob({ x: 0.3, y: 0.6, size: 0.6, temp: 0.9 });
    const big = createBlob({ x: 0.7, y: 0.6, size: 1.4, temp: 0.9 });
    // Hold their temperature so only size differs.
    for (let i = 0; i < 30; i++) {
      small.temp = big.temp = 0.9;
      stepLava([small, big], 1, 1);
    }
    expect(Math.abs(big.vy)).toBeGreaterThan(Math.abs(small.vy) * 2);
  });

  it("warms small blobs faster than big ones", () => {
    const small = createBlob({ x: 0.3, y: 0.97, size: 0.6, temp: 0.3 });
    const big = createBlob({ x: 0.7, y: 0.97, size: 1.4, temp: 0.3 });
    simulate([small, big], 1, 1);
    expect(small.temp).toBeGreaterThan(big.temp);
  });

  it("keeps blobs inside the glass without reflecting them off the walls", () => {
    const b = createBlob({ x: 0.92, y: 0.5, size: 1, temp: NEUTRAL_TEMP });
    b.vx = 0.01;
    let minX = 1;
    let maxX = 0;
    simulate([b], 10, 1, 1, () => {
      minX = Math.min(minX, b.x);
      maxX = Math.max(maxX, b.x);
    });
    expect(maxX).toBeLessThanOrEqual(0.95);
    // It eases back in rather than ricocheting across the lamp.
    expect(minX).toBeGreaterThan(0.6);
  });

  it("behaves the same at 30 and 240 fps", () => {
    const a = createBlob({ x: 0.5, y: 0.97, size: 1, temp: 0.3 });
    const b = createBlob({ x: 0.5, y: 0.97, size: 1, temp: 0.3 });
    simulate([a], 12, 2);
    simulate([b], 12, 0.25);
    expect(a.y).toBeCloseTo(b.y, 1);
    expect(a.temp).toBeCloseTo(b.temp, 1);
  });
});

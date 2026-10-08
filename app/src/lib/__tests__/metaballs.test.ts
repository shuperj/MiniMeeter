import { describe, it, expect } from "vitest";
import { sampleMetaballs, type Metaball } from "../metaballs";

const ball = (x: number, y: number, r: number): Metaball => ({ x, y, r });
const field = (x: number, y: number, balls: Metaball[]) =>
  sampleMetaballs(x, y, balls, { f: 0, gx: 0, gy: 0 }).f;

describe("sampleMetaballs", () => {
  it("is 1 exactly at a lone ball's radius", () => {
    expect(field(0.3, 0, [ball(0, 0, 0.3)])).toBeCloseTo(1);
  });

  it("is above 1 inside a ball and below it far away", () => {
    const balls = [ball(0.5, 0.5, 0.1)];
    expect(field(0.52, 0.5, balls)).toBeGreaterThan(1);
    expect(field(0.9, 0.9, balls)).toBeLessThan(0.1);
  });

  it("merges two nearby balls across the gap between them", () => {
    // Midway between two balls, neither alone reaches 1 but together they do.
    const a = ball(0.4, 0.5, 0.08);
    const b = ball(0.6, 0.5, 0.08);
    expect(field(0.5, 0.5, [a])).toBeLessThan(1);
    expect(field(0.5, 0.5, [a, b])).toBeGreaterThan(1);
  });

  it("stays finite at a ball's center", () => {
    const s = sampleMetaballs(0.5, 0.5, [ball(0.5, 0.5, 0.1)], { f: 0, gx: 0, gy: 0 });
    expect(Number.isFinite(s.f)).toBe(true);
    expect(Number.isFinite(s.gx)).toBe(true);
  });

  it("stretches a ball along y when sy > 1, keeping it narrower in x", () => {
    const tall = [{ x: 0, y: 0, r: 0.1, sx: 0.8, sy: 1.6 }];
    expect(field(0, 0.15, tall)).toBeGreaterThan(1);
    expect(field(0.09, 0, tall)).toBeLessThan(1);
  });

  it("returns the analytic gradient of a stretched field", () => {
    const balls = [{ x: 0.3, y: 0.4, r: 0.1, sx: 0.7, sy: 1.8 }, ball(0.6, 0.55, 0.12)];
    const s = sampleMetaballs(0.42, 0.47, balls, { f: 0, gx: 0, gy: 0 });
    const h = 1e-5;
    const dfdx = (field(0.42 + h, 0.47, balls) - field(0.42 - h, 0.47, balls)) / (2 * h);
    const dfdy = (field(0.42, 0.47 + h, balls) - field(0.42, 0.47 - h, balls)) / (2 * h);
    expect(s.gx).toBeCloseTo(dfdx, 3);
    expect(s.gy).toBeCloseTo(dfdy, 3);
  });

  it("reports each ball's share of the field when asked", () => {
    const contrib = new Float32Array(2);
    const s = sampleMetaballs(0.45, 0.5, [ball(0.4, 0.5, 0.1), ball(0.6, 0.5, 0.1)], { f: 0, gx: 0, gy: 0 }, contrib);
    expect(contrib[0] + contrib[1]).toBeCloseTo(s.f);
    expect(contrib[0]).toBeGreaterThan(contrib[1]);
  });

  it("softens the center spike while barely moving the surface", () => {
    const balls = [ball(0, 0, 0.3)];
    const soft = (x: number) => sampleMetaballs(x, 0, balls, { f: 0, gx: 0, gy: 0 }, undefined, 0.05).f;
    expect(soft(0)).toBeCloseTo(20); // 1 / 0.05 instead of near-infinite
    expect(soft(0.3)).toBeGreaterThan(0.94);
    expect(soft(0.3)).toBeLessThan(1);
  });

  it("lets a ball carry its own absolute softening", () => {
    // A tiny ball softened on a big scale only adds a gentle bump, no spike.
    const tiny = { x: 0, y: 0, r: 0.02, soft: 0.01 };
    const peak = sampleMetaballs(0, 0, [tiny], { f: 0, gx: 0, gy: 0 }, undefined, 0.05).f;
    expect(peak).toBeCloseTo(0.04);
  });

  it("returns the analytic gradient of a softened field", () => {
    const balls = [ball(0.3, 0.4, 0.1), ball(0.6, 0.55, 0.12)];
    const at = (x: number, y: number) => sampleMetaballs(x, y, balls, { f: 0, gx: 0, gy: 0 }, undefined, 0.05);
    const s = at(0.45, 0.5);
    const h = 1e-5;
    expect(s.gx).toBeCloseTo((at(0.45 + h, 0.5).f - at(0.45 - h, 0.5).f) / (2 * h), 3);
    expect(s.gy).toBeCloseTo((at(0.45, 0.5 + h).f - at(0.45, 0.5 - h).f) / (2 * h), 3);
  });

  it("returns the analytic gradient of the field", () => {
    const balls = [ball(0.3, 0.4, 0.1), ball(0.6, 0.55, 0.12)];
    const s = sampleMetaballs(0.45, 0.5, balls, { f: 0, gx: 0, gy: 0 });
    const h = 1e-5;
    const dfdx = (field(0.45 + h, 0.5, balls) - field(0.45 - h, 0.5, balls)) / (2 * h);
    const dfdy = (field(0.45, 0.5 + h, balls) - field(0.45, 0.5 - h, balls)) / (2 * h);
    expect(s.gx).toBeCloseTo(dfdx, 3);
    expect(s.gy).toBeCloseTo(dfdy, 3);
  });
});

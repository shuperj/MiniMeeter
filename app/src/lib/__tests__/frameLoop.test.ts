import { describe, it, expect } from "vitest";
import { bucketOf, createFramePacer, createTrailFade, frameChance, frameDelta, perFrameAlpha } from "../frameLoop";

/** Drive a pacer with display refreshes at `hz` for one second; count draws. */
function drawsPerSecond(hz: number, fps: number, jitterMs = 0): number {
  const pace = createFramePacer();
  let draws = 0;
  for (let i = 0; i < hz; i++) {
    const jitter = i % 2 === 0 ? jitterMs : -jitterMs;
    if (pace((i * 1000) / hz + jitter, fps)) draws++;
  }
  return draws;
}

describe("createFramePacer", () => {
  it("halves a 60 Hz display for a 30 fps cap", () => {
    expect(drawsPerSecond(60, 30)).toBe(30);
  });

  it("draws every frame when the cap matches the display", () => {
    expect(drawsPerSecond(60, 60)).toBe(60);
  });

  it("holds the cap on a high-refresh display", () => {
    expect(drawsPerSecond(144, 60)).toBeGreaterThanOrEqual(58);
    expect(drawsPerSecond(144, 60)).toBeLessThanOrEqual(62);
    expect(drawsPerSecond(144, 30)).toBeGreaterThanOrEqual(29);
    expect(drawsPerSecond(144, 30)).toBeLessThanOrEqual(31);
  });

  it("runs at high refresh caps, and never above the display", () => {
    expect(drawsPerSecond(240, 240)).toBe(240);
    expect(drawsPerSecond(240, 144)).toBeGreaterThanOrEqual(142);
    expect(drawsPerSecond(240, 144)).toBeLessThanOrEqual(146);
    expect(drawsPerSecond(144, 240)).toBe(144);
  });

  it("tolerates timestamp jitter", () => {
    expect(drawsPerSecond(60, 30, 1.5)).toBe(30);
  });

  it("doesn't burst to catch up after a stall", () => {
    const pace = createFramePacer();
    expect(pace(0, 30)).toBe(true);
    // A 500 ms hitch, then normal 60 Hz frames: no back-to-back catch-up draws.
    expect(pace(500, 30)).toBe(true);
    expect(pace(516.7, 30)).toBe(false);
  });
});

describe("frameDelta", () => {
  it("is 1 for one 60 Hz frame and 2 for one 30 Hz frame", () => {
    expect(frameDelta(1000 / 60)).toBeCloseTo(1);
    expect(frameDelta(1000 / 30)).toBeCloseTo(2);
  });

  it("clamps long stalls and negative gaps", () => {
    expect(frameDelta(5000)).toBeCloseTo(6);
    expect(frameDelta(-10)).toBe(0);
  });
});

describe("perFrameAlpha", () => {
  it("matches the tuned value at dt = 1", () => {
    expect(perFrameAlpha(0.08, 1)).toBeCloseTo(0.08);
  });

  it("fades as much in one 30 Hz frame as in two 60 Hz frames", () => {
    const twoSmall = 1 - (1 - 0.08) * (1 - 0.08);
    expect(perFrameAlpha(0.08, 2)).toBeCloseTo(twoSmall);
  });
});

describe("bucketOf", () => {
  it("spreads 0..1 across buckets and clamps the ends", () => {
    expect(bucketOf(0, 8)).toBe(0);
    expect(bucketOf(0.5, 8)).toBe(4);
    expect(bucketOf(1, 8)).toBe(7);
    expect(bucketOf(-0.2, 8)).toBe(0);
    expect(bucketOf(1.5, 8)).toBe(7);
  });
});

describe("createTrailFade", () => {
  /** Total fraction faded over one second of frames at `fps`. */
  function fadedInOneSecond(fps: number, alpha: number): number {
    const fade = createTrailFade(alpha);
    const dt = 60 / fps;
    let remaining = 1;
    for (let i = 0; i < fps; i++) remaining *= 1 - fade(dt);
    return 1 - remaining;
  }

  it("fades the same amount per second at 30 and 240 fps", () => {
    expect(fadedInOneSecond(240, 0.04)).toBeCloseTo(fadedInOneSecond(30, 0.04), 1);
    expect(fadedInOneSecond(240, 0.15)).toBeCloseTo(fadedInOneSecond(30, 0.15), 2);
  });

  it("never paints a fade too faint to survive 8-bit rounding", () => {
    const fade = createTrailFade(0.04);
    for (let i = 0; i < 100; i++) {
      const a = fade(0.25);
      expect(a === 0 || a >= 0.1).toBe(true);
    }
  });
});

describe("frameChance", () => {
  it("adds up to the same odds per second at any frame rate", () => {
    const perSecond = (fps: number) => 1 - Math.pow(1 - frameChance(0.05, 60 / fps), fps);
    expect(perSecond(240)).toBeCloseTo(perSecond(30), 5);
  });
});

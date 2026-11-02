import { describe, expect, it } from "vitest";
import { levelToMeter } from "../meterScale";

describe("levelToMeter", () => {
  it("is full at 0 dBFS and empty at silence", () => {
    expect(levelToMeter(1)).toBe(1);
    expect(levelToMeter(0)).toBe(0);
  });

  it("puts -18 dB at 70% of a -60 dB scale", () => {
    expect(levelToMeter(10 ** (-18 / 20))).toBeCloseTo(0.7);
  });

  it("clamps above full scale and below the floor", () => {
    expect(levelToMeter(2)).toBe(1);
    expect(levelToMeter(10 ** (-80 / 20))).toBe(0);
  });
});

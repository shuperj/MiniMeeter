import { describe, it, expect } from "vitest";
import { visualizerLevel } from "../visualizerLevel";

const strips = (entries: [number, boolean][]) =>
  new Map(entries.map(([strip, muted]) => [strip, { muted }]));

describe("visualizerLevel", () => {
  it("is the loudest pre-fader level among unmuted strips", () => {
    const pre = new Map([[0, 0.1], [7, 0.28]]);
    expect(visualizerLevel(pre, strips([[0, false], [7, false]]))).toBeCloseTo(0.28);
  });

  it("ignores muted strips", () => {
    const pre = new Map([[0, 0.9], [7, 0.28]]);
    expect(visualizerLevel(pre, strips([[0, true], [7, false]]))).toBeCloseTo(0.28);
  });

  it("counts strips with no known mute state", () => {
    expect(visualizerLevel(new Map([[3, 0.4]]), strips([]))).toBeCloseTo(0.4);
  });

  it("is 0 with nothing playing", () => {
    expect(visualizerLevel(new Map(), strips([]))).toBe(0);
  });
});

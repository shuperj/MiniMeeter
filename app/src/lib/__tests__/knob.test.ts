import { describe, it, expect } from "vitest";
import {
  arcPath,
  dbToNorm,
  dragNorm,
  DRAG_PX_FULL_SWEEP,
  KNOB_START,
  KNOB_SWEEP,
  knobColumns,
  normToAngle,
  normToDb,
  polar,
} from "../knob";

describe("dial geometry", () => {
  it("sweeps from lower-left over the top to lower-right", () => {
    expect(normToAngle(0)).toBe(KNOB_START);
    expect(normToAngle(0.5)).toBe(270); // straight up in SVG's y-down frame
    expect(normToAngle(1)).toBe(KNOB_START + KNOB_SWEEP);
  });

  it("clamps out-of-range positions to the ends", () => {
    expect(normToAngle(-1)).toBe(KNOB_START);
    expect(normToAngle(2)).toBe(KNOB_START + KNOB_SWEEP);
  });

  it("puts 270° at the top of the circle", () => {
    const p = polar(50, 50, 10, 270);
    expect(p.x).toBeCloseTo(50);
    expect(p.y).toBeCloseTo(40);
  });

  it("uses the large-arc flag only past 180°", () => {
    expect(arcPath(50, 50, 10, 135, 300)).toContain(" 0 0 1 ");
    expect(arcPath(50, 50, 10, 135, 405)).toContain(" 0 1 1 ");
  });
});

describe("dB mapping", () => {
  it("round-trips a channel's range", () => {
    expect(dbToNorm(-45, -45, 3)).toBe(0);
    expect(dbToNorm(3, -45, 3)).toBe(1);
    expect(normToDb(dbToNorm(-21, -45, 3), -45, 3)).toBe(-21);
  });

  it("clamps values outside the range", () => {
    expect(dbToNorm(12, -30, 9)).toBe(1);
    expect(dbToNorm(-60, -30, 9)).toBe(0);
  });

  it("rounds to 0.1 dB", () => {
    expect(normToDb(1 / 3, 0, 1)).toBe(0.3);
  });

  it("survives a zero-width range", () => {
    expect(dbToNorm(0, 0, 0)).toBe(0);
  });
});

describe("dragNorm", () => {
  it("turns up when dragged up or right, down when dragged down or left", () => {
    expect(dragNorm(0.5, 0, -DRAG_PX_FULL_SWEEP / 4, false)).toBeCloseTo(0.75);
    expect(dragNorm(0.5, DRAG_PX_FULL_SWEEP / 4, 0, false)).toBeCloseTo(0.75);
    expect(dragNorm(0.5, 0, DRAG_PX_FULL_SWEEP / 4, false)).toBeCloseTo(0.25);
    expect(dragNorm(0.5, -DRAG_PX_FULL_SWEEP / 4, 0, false)).toBeCloseTo(0.25);
  });

  it("does not move on a press without movement", () => {
    expect(dragNorm(0.37, 0, 0, false)).toBe(0.37);
  });

  it("moves a fifth as far with Shift held", () => {
    expect(dragNorm(0.5, 0, -DRAG_PX_FULL_SWEEP / 2, true)).toBeCloseTo(0.6);
  });

  it("stops at the ends", () => {
    expect(dragNorm(0.9, 0, -1000, false)).toBe(1);
    expect(dragNorm(0.1, 0, 1000, false)).toBe(0);
  });
});

describe("knobColumns", () => {
  const opts = { gap: 8, chromeHeight: 50, chromeWidth: 12 };

  it("keeps one row in a wide, short window", () => {
    expect(knobColumns(420, 220, 5, opts)).toBe(5);
  });

  it("wraps into a grid in a narrow window", () => {
    const cols = knobColumns(220, 260, 5, opts);
    expect(cols).toBeGreaterThan(1);
    expect(cols).toBeLessThan(5);
  });

  it("stacks in a tall, thin window", () => {
    expect(knobColumns(120, 700, 4, opts)).toBe(1);
  });

  it("handles one knob and an unmeasured area", () => {
    expect(knobColumns(300, 300, 1, opts)).toBe(1);
    expect(knobColumns(0, 0, 4, opts)).toBe(4);
  });
});

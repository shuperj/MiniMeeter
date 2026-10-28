import { describe, it, expect } from "vitest";
import { busLabel, outputsForBus, activeOutputIndex, clampBus } from "../outputs";
import type { A1Device } from "../../config";

const dev = (name: string, bus?: number): A1Device => ({ driver: "wdm", name, display: name, bus });

describe("busLabel", () => {
  it("names hardware buses A1 upward", () => {
    expect(busLabel(0)).toBe("A1");
    expect(busLabel(4)).toBe("A5");
  });
});

describe("outputsForBus", () => {
  it("treats entries without a bus as A1", () => {
    const outputs = [dev("Speakers"), dev("Headset", 1), dev("Focusrite", 0)];
    expect(outputsForBus(outputs, 0).map((o) => o.name)).toEqual(["Speakers", "Focusrite"]);
    expect(outputsForBus(outputs, 1).map((o) => o.name)).toEqual(["Headset"]);
    expect(outputsForBus(outputs, 2)).toEqual([]);
  });
});

describe("activeOutputIndex", () => {
  const choices = [dev("Speakers"), dev("Focusrite USB ASIO")];

  it("finds the device Voicemeeter reports", () => {
    expect(activeOutputIndex(choices, "Focusrite USB ASIO")).toBe(1);
  });

  it("is -1 for no device or one not in the list", () => {
    expect(activeOutputIndex(choices, "")).toBe(-1);
    expect(activeOutputIndex(choices, undefined)).toBe(-1);
    expect(activeOutputIndex(choices, "HDMI")).toBe(-1);
  });
});

describe("clampBus", () => {
  it("keeps a bus this edition has", () => {
    expect(clampBus(4, 5)).toBe(4);
  });

  it("falls back to A1 for a bus Banana lacks, or junk", () => {
    expect(clampBus(4, 3)).toBe(0);
    expect(clampBus(-1, 3)).toBe(0);
    expect(clampBus(1.5, 3)).toBe(0);
  });
});

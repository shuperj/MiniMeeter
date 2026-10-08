import { describe, it, expect } from "vitest";
import { PRESET_GROUPS, PRESET_LABELS, usesSpectrum } from "../visualizerPresets";

describe("PRESET_GROUPS", () => {
  it("lists every preset exactly once, under 2D or 3D", () => {
    const grouped = PRESET_GROUPS.flatMap((g) => g.presets);
    expect([...grouped].sort()).toEqual(Object.keys(PRESET_LABELS).sort());
    expect(PRESET_GROUPS.map((g) => g.label)).toEqual(["2D", "3D"]);
  });

  it("gives every preset a label", () => {
    for (const label of Object.values(PRESET_LABELS)) expect(label.length).toBeGreaterThan(0);
  });
});

describe("usesSpectrum", () => {
  it("is true for every preset, so capture runs whenever one is on screen", () => {
    for (const preset of Object.keys(PRESET_LABELS) as (keyof typeof PRESET_LABELS)[]) {
      expect(usesSpectrum(preset)).toBe(true);
    }
  });
});

import { describe, it, expect } from "vitest";
import { DEFAULT_BACKGROUND_STYLE, type BackgroundStyle } from "../../types/style";
import { normalizePresetStyles, presetStyleOf, switchPreset } from "../presetStyles";

const base: BackgroundStyle = {
  ...DEFAULT_BACKGROUND_STYLE,
  visualizerPreset: "lava-lamp",
  visualizerOpacity: 0.7,
  visualizerIntensity: 0.3,
  visualizerSpeed: 0.8,
  visualizerFilters: ["crt"],
  visualizerCelEdges: "light",
  visualizerColorSource: "palette",
  visualizerColor: "#112233",
  visualizerPalette: ["#111111", "#222222"],
  presetStyles: {},
};

describe("switchPreset", () => {
  it("remembers the outgoing preset's settings and keeps them as the start for a new one", () => {
    const next = switchPreset(base, "ferrofluid");
    expect(next.visualizerPreset).toBe("ferrofluid");
    expect(next.presetStyles["lava-lamp"]).toEqual(presetStyleOf(base));
    // Never seen before: carries on with what was set.
    expect(next.visualizerOpacity).toBe(0.7);
    expect(next.visualizerFilters).toEqual(["crt"]);
    expect(next.visualizerPalette).toEqual(["#111111", "#222222"]);
  });

  it("restores a preset's own settings when switching back to it", () => {
    const onFerro = { ...switchPreset(base, "ferrofluid"), visualizerOpacity: 0.2, visualizerFilters: ["cel" as const], visualizerColorSource: "accent" as const };
    const back = switchPreset(onFerro, "lava-lamp");
    expect(back.visualizerPreset).toBe("lava-lamp");
    expect(back.visualizerOpacity).toBe(0.7);
    expect(back.visualizerFilters).toEqual(["crt"]);
    expect(back.visualizerColorSource).toBe("palette");
    // And Ferrofluid's own values are kept for next time.
    expect(back.presetStyles.ferrofluid?.visualizerOpacity).toBe(0.2);
    expect(back.presetStyles.ferrofluid?.visualizerFilters).toEqual(["cel"]);
  });

  it("leaves the global settings alone", () => {
    const next = switchPreset({ ...base, visualizerFps: 144, unfocusedVisualizerMode: "60" }, "pipes");
    expect(next.visualizerFps).toBe(144);
    expect(next.unfocusedVisualizerMode).toBe("60");
    expect(next.backgroundMode).toBe(base.backgroundMode);
  });

  it("copies arrays, so editing the live palette can't change the remembered one", () => {
    const next = switchPreset(base, "ferrofluid");
    next.visualizerPalette.push("#333333");
    expect(next.presetStyles["lava-lamp"]?.visualizerPalette).toEqual(["#111111", "#222222"]);
  });
});

describe("normalizePresetStyles", () => {
  it("keeps valid entries for known presets and drops the rest", () => {
    const out = normalizePresetStyles({
      "lava-lamp": { visualizerOpacity: 0.5, visualizerFilters: ["crt", "bogus"], visualizerCelEdges: "nope", visualizerPalette: ["#123456", "#abcdef"], extra: 1 },
      aurora: { visualizerOpacity: 0.5 },
      pipes: "junk",
    });
    expect(Object.keys(out)).toEqual(["lava-lamp"]);
    expect(out["lava-lamp"]).toEqual({
      visualizerOpacity: 0.5,
      visualizerFilters: ["crt"],
      visualizerPalette: ["#123456", "#abcdef"],
    });
  });

  it("is empty for anything that isn't an object", () => {
    expect(normalizePresetStyles(undefined)).toEqual({});
    expect(normalizePresetStyles([1, 2])).toEqual({});
  });
});

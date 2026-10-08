import { describe, it, expect } from "vitest";
import { filterResolution, normalizeFilters } from "../visualizerFilter";

describe("filterResolution", () => {
  it("leaves a scene's own resolution alone with no filters", () => {
    expect(filterResolution(1, [])).toBe(1);
    expect(filterResolution(1 / 3, [])).toBeCloseTo(1 / 3);
  });

  it("drops to chunky pixels for Pixelate, never sharper than the scene asked for", () => {
    expect(filterResolution(1, ["pixelate"])).toBe(0.2);
    expect(filterResolution(0.1, ["pixelate"])).toBe(0.1);
  });

  it("uses half resolution behind the CRT scanlines", () => {
    expect(filterResolution(1, ["crt"])).toBe(0.5);
    expect(filterResolution(1 / 3, ["crt"])).toBeCloseTo(1 / 3);
  });

  it("keeps full resolution for Cel, whose outlines need the pixels", () => {
    expect(filterResolution(1, ["cel"])).toBe(1);
  });

  it("takes the lowest resolution when filters stack", () => {
    expect(filterResolution(1, ["crt", "pixelate"])).toBe(0.2);
    expect(filterResolution(1, ["cel", "crt"])).toBe(0.5);
  });
});

describe("normalizeFilters", () => {
  it("keeps known filters once each, in application order", () => {
    expect(normalizeFilters(["crt", "pixelate", "crt"])).toEqual(["pixelate", "crt"]);
    expect(normalizeFilters(["cel"])).toEqual(["cel"]);
  });

  it("drops anything unknown, and anything that is not a list", () => {
    expect(normalizeFilters(["none", "crt", 3])).toEqual(["crt"]);
    expect(normalizeFilters("crt")).toEqual([]);
    expect(normalizeFilters(undefined)).toEqual([]);
  });
});

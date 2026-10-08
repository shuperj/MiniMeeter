import { describe, it, expect } from "vitest";
import { filterResolution } from "../visualizerFilter";

describe("filterResolution", () => {
  it("leaves a scene's own resolution alone with no filter", () => {
    expect(filterResolution(1, "none")).toBe(1);
    expect(filterResolution(1 / 3, "none")).toBeCloseTo(1 / 3);
  });

  it("drops to chunky pixels for Pixelate, never sharper than the scene asked for", () => {
    expect(filterResolution(1, "pixelate")).toBe(0.2);
    expect(filterResolution(0.1, "pixelate")).toBe(0.1);
  });

  it("uses half resolution behind the CRT scanlines", () => {
    expect(filterResolution(1, "crt")).toBe(0.5);
    expect(filterResolution(1 / 3, "crt")).toBeCloseTo(1 / 3);
  });
});

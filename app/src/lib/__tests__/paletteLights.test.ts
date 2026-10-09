import { describe, it, expect } from "vitest";
import { paletteLights } from "../paletteLights";

const off = [0, 0, 0];
const white = [1, 1, 1];

describe("paletteLights", () => {
  it("colours the material with a single colour, lit from the right by a neutral light, with shadows a darker shade of itself", () => {
    const l = paletteLights(["58,134,255"]);
    expect(l.fluid).toEqual([58 / 255, 134 / 255, 1]);
    expect(l.light).toEqual(white);
    expect(l.highlight).toEqual(white);
    expect(l.rim).toEqual(off);
    // Same hue, darker: every channel scaled by the same factor.
    for (let c = 0; c < 3; c++) {
      expect(l.shadow[c]).toBeLessThan(l.fluid[c]);
      expect(l.shadow[c] / l.fluid[c]).toBeCloseTo(l.shadow[2] / l.fluid[2], 6);
    }
  });

  it("takes the light from the second colour and the shadow from the third", () => {
    const l = paletteLights(["255,0,0", "0,255,0", "0,0,255"]);
    expect(l.fluid).toEqual([1, 0, 0]);
    expect(l.light).toEqual([0, 1, 0]);
    expect(l.shadow).toEqual([0, 0, 1]);
    expect(l.highlight).toEqual(white);
    expect(l.rim).toEqual(off);
  });

  it("takes the highlight from the fourth colour and the rim light from the fifth", () => {
    const l = paletteLights(["255,0,0", "0,255,0", "0,0,255", "255,255,0", "0,255,255"]);
    expect(l.highlight).toEqual([1, 1, 0]);
    expect(l.rim).toEqual([0, 1, 1]);
  });

  it("offers the palette's own colours as swatches, or four shades of a single colour", () => {
    expect(paletteLights(["255,0,0", "0,255,0", "0,0,255"]).swatches).toEqual([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
    const shades = paletteLights(["0,0,255"]).swatches;
    expect(shades).toHaveLength(4);
    for (let i = 1; i < shades.length; i++) expect(shades[i][2]).toBeGreaterThanOrEqual(shades[i - 1][2]);
    expect(shades[2]).toEqual([0, 0, 1]);
    expect(shades[3][0]).toBeGreaterThan(0);
  });
});

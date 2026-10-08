import { describe, it, expect } from "vitest";
import { ferroLights } from "../ferroLights";

const off = [0, 0, 0];

describe("ferroLights", () => {
  it("lights one side only with a single color: a key light and no fill or rim", () => {
    const l = ferroLights(["58,134,255"]);
    expect(l.key).toEqual([58 / 255, 134 / 255, 1]);
    expect(l.fill).toEqual(off);
    expect(l.rim).toEqual(off);
    // The reflected window is a lighter shade of the same color, the sky a darker one.
    expect(l.window[2]).toBeGreaterThan(l.window[0]);
    expect(l.window[0]).toBeGreaterThan(l.key[0]);
    expect(l.sky[2]).toBeLessThan(l.key[2]);
    expect(l.sky[2]).toBeGreaterThan(l.sky[0]);
  });

  it("takes the fill from the second palette color and the sky from the third", () => {
    const l = ferroLights(["255,0,0", "0,255,0", "0,0,255"]);
    expect(l.key).toEqual([1, 0, 0]);
    expect(l.fill[1]).toBeGreaterThan(0);
    expect(l.fill[0]).toBe(0);
    expect(l.fill[2]).toBe(0);
    expect(l.sky[2]).toBeGreaterThan(0);
    expect(l.sky[0]).toBe(0);
    expect(l.rim).toEqual(off);
  });

  it("adds a rim light from the fourth color and a ceiling from the fifth", () => {
    const l = ferroLights(["255,0,0", "0,255,0", "0,0,255", "255,255,0", "0,255,255"]);
    expect(l.rim[0]).toBeGreaterThan(0);
    expect(l.rim[1]).toBeGreaterThan(0);
    expect(l.rim[2]).toBe(0);
    // A soft, lightened version of the fifth color.
    expect(l.ceiling[1]).toBeGreaterThan(l.ceiling[0]);
    expect(l.ceiling[2]).toBeGreaterThan(l.ceiling[0]);
    expect(l.ceiling[0]).toBeGreaterThan(0);
  });

  it("uses the window color as the ceiling when there is no fifth color", () => {
    const l = ferroLights(["255,0,0", "0,255,0"]);
    expect(l.ceiling).toEqual(l.window);
  });
});

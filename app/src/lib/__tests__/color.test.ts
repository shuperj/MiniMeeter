import { describe, it, expect } from "vitest";
import { colorVariants, hexToRgb, hueRotate, normalizePalette, parseRgb, saturationShades } from "../color";

describe("parseRgb", () => {
  it("reads an 'r,g,b' string", () => {
    expect(parseRgb("58,134,255")).toEqual([58, 134, 255]);
  });

  it("falls back to 0 for junk channels", () => {
    expect(parseRgb("x, 10 ,")).toEqual([0, 10, 0]);
  });
});

describe("hueRotate", () => {
  it("leaves a color alone at 0 and 360 degrees", () => {
    expect(hueRotate([58, 134, 255], 0)).toEqual([58, 134, 255]);
    expect(hueRotate([58, 134, 255], 360)).toEqual([58, 134, 255]);
  });

  it("leaves greys alone", () => {
    expect(hueRotate([120, 120, 120], 90)).toEqual([120, 120, 120]);
  });

  it("turns red toward green at 120 degrees", () => {
    const [r, g] = hueRotate([255, 0, 0], 120);
    expect(g).toBeGreaterThan(r);
  });

  it("keeps channels in 0..255 integers", () => {
    for (const deg of [30, 90, 150, 210, 270, 330]) {
      for (const c of hueRotate([255, 20, 200], deg)) {
        expect(Number.isInteger(c)).toBe(true);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(255);
      }
    }
  });
});

describe("saturationShades", () => {
  it("runs from the full color down to a near-grey of the same brightness", () => {
    const shades = saturationShades([58, 134, 255], 4, 0.15);
    expect(shades).toHaveLength(4);
    expect(shades[0]).toEqual([58, 134, 255]);
    const [r, g, b] = shades[3];
    // Mostly grey: channels close together, but still a hint of blue.
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(40);
    expect(b).toBeGreaterThan(r);
  });

  it("returns just the color when asked for one shade", () => {
    expect(saturationShades([10, 20, 30], 1, 0)).toEqual([[10, 20, 30]]);
  });
});

describe("hexToRgb", () => {
  it("reads #rrggbb", () => {
    expect(hexToRgb("#3a86ff")).toEqual([58, 134, 255]);
  });

  it("falls back to black for junk", () => {
    expect(hexToRgb("nope")).toEqual([0, 0, 0]);
  });
});

describe("normalizePalette", () => {
  const fallback = ["#111111", "#222222"];

  it("keeps a valid list of 2-5 colors", () => {
    expect(normalizePalette(["#3a86ff", "#ff5e9c", "#ffd166"], fallback)).toEqual([
      "#3a86ff",
      "#ff5e9c",
      "#ffd166",
    ]);
  });

  it("drops junk entries and caps the list at five", () => {
    const raw = ["#000001", 7, "red", "#000002", "#000003", "#000004", "#000005", "#000006"];
    expect(normalizePalette(raw, fallback)).toEqual([
      "#000001",
      "#000002",
      "#000003",
      "#000004",
      "#000005",
    ]);
  });

  it("falls back when fewer than two usable colors remain", () => {
    expect(normalizePalette(["#000001"], fallback)).toEqual(fallback);
    expect(normalizePalette(undefined, fallback)).toEqual(fallback);
  });
});

describe("colorVariants", () => {
  it("uses a multi-color palette as it is", () => {
    const palette: [number, number, number][] = [[255, 0, 0], [0, 255, 0]];
    expect(colorVariants(palette, 4)).toEqual(palette);
  });

  it("derives shades of a single color, all of the same hue", () => {
    const variants = colorVariants([[58, 134, 255]], 4);
    expect(variants).toHaveLength(4);
    expect(variants[0]).toEqual([58, 134, 255]);
    for (const [r, g, b] of variants) {
      // Still blue: blue channel leads, red trails.
      expect(b).toBeGreaterThanOrEqual(g);
      expect(g).toBeGreaterThanOrEqual(r);
    }
  });
});

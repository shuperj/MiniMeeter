import { describe, it, expect } from "vitest";
import { chooseBackdrop, type BackdropInput } from "../backdrop";

const base: BackdropInput = {
  backgroundMode: "visualizer",
  titlebarStyle: "solid",
  focused: true,
  opacity: 1,
  supported: true,
};

describe("chooseBackdrop", () => {
  it("draws no native material for a solid bar over a visualizer", () => {
    expect(chooseBackdrop(base)).toEqual({ backdrop: "none", nativeTitlebar: false });
  });

  it("puts Mica behind a Mica bar and Acrylic behind a Clear bar", () => {
    expect(chooseBackdrop({ ...base, titlebarStyle: "mica" })).toEqual({ backdrop: "mica", nativeTitlebar: true });
    expect(chooseBackdrop({ ...base, titlebarStyle: "clear" })).toEqual({ backdrop: "acrylic", nativeTitlebar: true });
  });

  it("keeps the Acrylic background mode, which a Clear bar shares and a Mica bar can't", () => {
    const acrylic = { ...base, backgroundMode: "acrylic" as const };
    expect(chooseBackdrop(acrylic)).toEqual({ backdrop: "acrylic", nativeTitlebar: false });
    expect(chooseBackdrop({ ...acrylic, titlebarStyle: "clear" })).toEqual({ backdrop: "acrylic", nativeTitlebar: true });
    expect(chooseBackdrop({ ...acrylic, titlebarStyle: "mica" })).toEqual({ backdrop: "acrylic", nativeTitlebar: false });
  });

  it("falls back to the CSS glass while unfocused (Windows draws the materials flat then)", () => {
    expect(chooseBackdrop({ ...base, titlebarStyle: "mica", focused: false })).toEqual({ backdrop: "none", nativeTitlebar: false });
    expect(chooseBackdrop({ ...base, backgroundMode: "acrylic", focused: false })).toEqual({ backdrop: "none", nativeTitlebar: false });
  });

  it("falls back below full window opacity, where the window is layered and gets no material", () => {
    expect(chooseBackdrop({ ...base, titlebarStyle: "clear", opacity: 0.9 })).toEqual({ backdrop: "none", nativeTitlebar: false });
  });

  it("falls back when this Windows can't draw the materials", () => {
    expect(chooseBackdrop({ ...base, titlebarStyle: "mica", supported: false })).toEqual({ backdrop: "none", nativeTitlebar: false });
  });
});

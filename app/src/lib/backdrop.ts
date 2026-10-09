// Which of Windows' backdrop materials goes behind the window, and whether
// the title bar shows it. The material covers the whole window but only shows
// where the page is transparent: everywhere for the Acrylic background mode,
// just the title bar's strip for a Mica or Clear bar.

import type { BackgroundMode, TitlebarStyle } from "../types/style";

/** The material set on the window (see the set_backdrop command). */
export type Backdrop = "none" | "acrylic" | "mica";

export interface BackdropInput {
  backgroundMode: BackgroundMode;
  titlebarStyle: TitlebarStyle;
  focused: boolean;
  /** Whole-window opacity, 0..1. */
  opacity: number;
  /** False once Windows has refused a material (no Mica before Windows 11). */
  supported: boolean;
}

export interface BackdropChoice {
  backdrop: Backdrop;
  /** The title bar leaves its strip transparent to show the material. */
  nativeTitlebar: boolean;
}

const NONE: BackdropChoice = { backdrop: "none", nativeTitlebar: false };

export function chooseBackdrop({ backgroundMode, titlebarStyle, focused, opacity, supported }: BackdropInput): BackdropChoice {
  // Windows draws the materials flat on an inactive window, and not at all on
  // a translucent (layered) one: the CSS glass stands in for both.
  if (!focused || opacity < 1 || !supported) return NONE;
  // The Acrylic background owns the window; a Clear bar is the same material.
  if (backgroundMode === "acrylic") return { backdrop: "acrylic", nativeTitlebar: titlebarStyle === "clear" };
  if (titlebarStyle === "mica") return { backdrop: "mica", nativeTitlebar: true };
  if (titlebarStyle === "clear") return { backdrop: "acrylic", nativeTitlebar: true };
  return NONE;
}

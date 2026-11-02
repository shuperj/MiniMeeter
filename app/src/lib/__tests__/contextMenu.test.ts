import { describe, expect, it } from "vitest";
import { fitMenu } from "../contextMenu";

const menu = { width: 100, height: 80 };
const win = { width: 220, height: 300 };

describe("fitMenu", () => {
  it("opens at the pointer when there is room", () => {
    expect(fitMenu(20, 30, menu, win)).toEqual({ left: 20, top: 30 });
  });

  it("moves back inside near the far edges", () => {
    expect(fitMenu(210, 290, menu, win)).toEqual({ left: 116, top: 216 });
  });

  it("stays on screen when the window is smaller than the menu", () => {
    expect(fitMenu(50, 50, menu, { width: 60, height: 40 })).toEqual({ left: 4, top: 4 });
  });
});

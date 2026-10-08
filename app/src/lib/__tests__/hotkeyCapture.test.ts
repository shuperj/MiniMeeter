import { describe, it, expect, vi } from "vitest";
import { createHotkeyCapture } from "../hotkeyCapture";

describe("createHotkeyCapture", () => {
  it("is idle until a capture begins, and idle again once it ends", () => {
    const capture = createHotkeyCapture();
    expect(capture.isCapturing()).toBe(false);
    const end = capture.begin();
    expect(capture.isCapturing()).toBe(true);
    end();
    expect(capture.isCapturing()).toBe(false);
  });

  it("stays capturing until every overlapping capture has ended", () => {
    const capture = createHotkeyCapture();
    const endA = capture.begin();
    const endB = capture.begin();
    endA();
    expect(capture.isCapturing()).toBe(true);
    endB();
    expect(capture.isCapturing()).toBe(false);
  });

  it("ignores ending the same capture twice", () => {
    const capture = createHotkeyCapture();
    const endA = capture.begin();
    const endB = capture.begin();
    endA();
    endA();
    expect(capture.isCapturing()).toBe(true);
    endB();
    expect(capture.isCapturing()).toBe(false);
  });

  it("notifies subscribers only when capturing flips", () => {
    const capture = createHotkeyCapture();
    const listener = vi.fn();
    const unsubscribe = capture.subscribe(listener);
    const endA = capture.begin();
    const endB = capture.begin();
    endA();
    endB();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    capture.begin();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

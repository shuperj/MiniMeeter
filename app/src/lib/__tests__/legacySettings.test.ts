import { describe, expect, it } from "vitest";
import { withoutLegacyChannelFields, withoutLegacyStyleFields } from "../legacySettings";

describe("withoutLegacyChannelFields", () => {
  it("drops only the retired fields", () => {
    const old = { label: "Mic", strip: 0, hasMute: true, muteHotkey: "F15", minDb: -3, maxDb: 6, defaultDb: 3, levelScale: 3.5 };
    expect(withoutLegacyChannelFields([old])).toEqual([{ label: "Mic", strip: 0, hasMute: true, muteHotkey: "F15" }]);
  });

  it("returns the same array when there is nothing to remove", () => {
    const current = [{ label: "Mic", strip: 0, hasMute: true }];
    expect(withoutLegacyChannelFields(current)).toBe(current);
  });

  it("handles a mix of old and current channels", () => {
    const current = { label: "Alerts", strip: 3, hasMute: true };
    const cleaned = withoutLegacyChannelFields([{ label: "VC", strip: 2, hasMute: true, maxDb: -3 }, current]);
    expect(cleaned).toEqual([{ label: "VC", strip: 2, hasMute: true }, current]);
  });
});

describe("withoutLegacyStyleFields", () => {
  it("drops only the retired fields", () => {
    const old = { channelControl: "knob", globalOpacity: 0.8, showOutputLevel: true };
    expect(withoutLegacyStyleFields(old)).toEqual({ channelControl: "knob" });
  });

  it("returns the same object when there is nothing to remove", () => {
    const current = { channelControl: "knob" };
    expect(withoutLegacyStyleFields(current)).toBe(current);
  });
});

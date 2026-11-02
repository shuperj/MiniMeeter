import { describe, expect, it } from "vitest";
import { splitRows } from "../appRows";

const session = (key: string, over: Partial<{ state: "active" | "inactive"; muted: boolean; volume: number }> = {}) => ({
  key,
  state: "inactive" as const,
  muted: false,
  volume: 1,
  ...over,
});
const keys = (rows: { key: string }[]) => rows.map((r) => r.key);
const nothing = new Set<string>();

describe("splitRows", () => {
  it("shows playing apps and tucks idle ones away", () => {
    const { main, more } = splitRows(
      [session("playing", { state: "active" }), session("idle")],
      () => false,
      nothing,
    );
    expect(keys(main)).toEqual(["playing"]);
    expect(keys(more)).toEqual(["idle"]);
  });

  it("keeps idle apps the user has muted or turned down", () => {
    const { main } = splitRows(
      [session("muted", { muted: true }), session("down", { volume: 0.5 })],
      () => false,
      nothing,
    );
    expect(keys(main)).toEqual(["muted", "down"]);
  });

  it("keeps an app that paused while the panel was open", () => {
    const { main } = splitRows([session("paused")], () => false, new Set(["paused"]));
    expect(keys(main)).toEqual(["paused"]);
  });

  it("always tucks hidden apps away, even while they play", () => {
    const { main, more } = splitRows([session("hidden", { state: "active" })], () => true, nothing);
    expect(main).toEqual([]);
    expect(keys(more)).toEqual(["hidden"]);
  });

  it("treats rounding near full volume as untouched", () => {
    const { more } = splitRows([session("full", { volume: 0.999 })], () => false, nothing);
    expect(keys(more)).toEqual(["full"]);
  });
});

import { describe, it, expect } from "vitest";
import { cubeSphere, MAX_FACE_VERTICES } from "../cubeSphere";

describe("cubeSphere", () => {
  it("puts every vertex on the unit sphere", () => {
    const { positions } = cubeSphere(8);
    expect(positions.length).toBe(6 * 8 * 8 * 3);
    for (let i = 0; i < positions.length; i += 3) {
      expect(Math.hypot(positions[i], positions[i + 1], positions[i + 2])).toBeCloseTo(1, 6);
    }
  });

  it("indexes two triangles per grid cell on each face, all within the vertex count", () => {
    const n = 8;
    const { positions, indices } = cubeSphere(n);
    expect(indices.length).toBe(6 * (n - 1) * (n - 1) * 6);
    const count = positions.length / 3;
    for (const i of indices) expect(i).toBeLessThan(count);
  });

  it("covers every direction: the face centres point along all six axes", () => {
    const { positions } = cubeSphere(9);
    const axes = new Set<string>();
    for (let i = 0; i < positions.length; i += 3) {
      const [x, y, z] = [positions[i], positions[i + 1], positions[i + 2]];
      for (const [v, name] of [[x, "x"], [y, "y"], [z, "z"]] as const) {
        if (Math.abs(v) > 0.9999) axes.add((v > 0 ? "+" : "-") + name);
      }
    }
    expect([...axes].sort()).toEqual(["+x", "+y", "+z", "-x", "-y", "-z"]);
  });

  it("stays within 16-bit indices at the largest allowed face size", () => {
    expect(6 * MAX_FACE_VERTICES * MAX_FACE_VERTICES).toBeLessThanOrEqual(65536);
    expect(() => cubeSphere(MAX_FACE_VERTICES + 1)).toThrow();
  });
});

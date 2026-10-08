import { describe, it, expect } from "vitest";
import { capsuleNormal, intersectCapsule, type Vec3 } from "../raytrace";

const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};

describe("intersectCapsule", () => {
  it("hits the side of a capsule lying across the view", () => {
    // Capsule along x at z = 10, radius 1: the surface facing us is at z = 9.
    const t = intersectCapsule([0, 0, 1], [-2, 0, 10], [2, 0, 10], 1);
    expect(t).toBeCloseTo(9);
  });

  it("hits the near end cap of a capsule pointing at the viewer", () => {
    // Axis along z from 10 to 14: the near cap's tip is at z = 9.
    expect(intersectCapsule([0, 0, 1], [0, 0, 10], [0, 0, 14], 1)).toBeCloseTo(9);
    // Same capsule, either end order.
    expect(intersectCapsule([0, 0, 1], [0, 0, 14], [0, 0, 10], 1)).toBeCloseTo(9);
  });

  it("treats a zero-length capsule as a sphere", () => {
    expect(intersectCapsule([0, 0, 1], [0, 0, 5], [0, 0, 5], 0.5)).toBeCloseTo(4.5);
  });

  it("misses when the ray passes outside the radius", () => {
    expect(intersectCapsule(norm([1, 0, 1]), [-2, 0, 10], [2, 0, 10], 0.5)).toBeLessThan(0);
  });

  it("joins pieces seamlessly: a cap inside the next piece is never what you see", () => {
    // Two pieces of one pipe along z. A ray slightly off-axis sees the near
    // piece's front, not the far piece's back cap.
    const rd = norm([0.02, 0, 1]);
    const near = intersectCapsule(rd, [0, 0, 10], [0, 0, 10.5], 1);
    const far = intersectCapsule(rd, [0, 0, 10.5], [0, 0, 11], 1);
    expect(near).toBeLessThan(far);
  });
});

describe("capsuleNormal", () => {
  it("points straight out of the side", () => {
    const n = capsuleNormal([0, 0, 9], [-2, 0, 10], [2, 0, 10], 1);
    expect(n[0]).toBeCloseTo(0);
    expect(n[2]).toBeCloseTo(-1);
  });

  it("points out of an end cap along the axis", () => {
    const n = capsuleNormal([0, 0, 9], [0, 0, 10], [0, 0, 14], 1);
    expect(n[2]).toBeCloseTo(-1);
  });
});

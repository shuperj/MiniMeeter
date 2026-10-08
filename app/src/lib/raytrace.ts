// Ray-capsule intersection for the Pipes visualizer's little software renderer.
// Rays start at the camera (the origin) and point into the scene (+z).
// After Inigo Quilez's capsule intersector.

export type Vec3 = [number, number, number];

/** Distance along a ray from the origin with unit direction `rd` to the sphere at `c`, or -1. */
function intersectSphere(rd: Vec3, c: Vec3, r: number): number {
  // oc = origin - c = -c
  const b = -(rd[0] * c[0] + rd[1] * c[1] + rd[2] * c[2]);
  const cc = c[0] * c[0] + c[1] * c[1] + c[2] * c[2] - r * r;
  const h = b * b - cc;
  return h > 0 ? -b - Math.sqrt(h) : -1;
}

/**
 * Distance along the ray (origin, unit direction `rd`) to the capsule from
 * `a` to `b` with radius `r`, or -1 on a miss. A zero-length capsule is a
 * sphere (the ball joints).
 */
export function intersectCapsule(rd: Vec3, a: Vec3, b: Vec3, r: number): number {
  const bax = b[0] - a[0];
  const bay = b[1] - a[1];
  const baz = b[2] - a[2];
  const baba = bax * bax + bay * bay + baz * baz;
  if (baba < 1e-12) return intersectSphere(rd, a, r);

  // oa = origin - a = -a
  const oax = -a[0];
  const oay = -a[1];
  const oaz = -a[2];
  const bard = bax * rd[0] + bay * rd[1] + baz * rd[2];
  const baoa = bax * oax + bay * oay + baz * oaz;
  const rdoa = rd[0] * oax + rd[1] * oay + rd[2] * oaz;
  const oaoa = oax * oax + oay * oay + oaz * oaz;

  const qa = baba - bard * bard;
  if (qa > 1e-9) {
    const qb = baba * rdoa - baoa * bard;
    const qc = baba * oaoa - baoa * baoa - r * r * baba;
    const h = qb * qb - qa * qc;
    if (h < 0) return -1;
    const t = (-qb - Math.sqrt(h)) / qa;
    const y = baoa + t * bard;
    // Hit the cylinder body between the two ends.
    if (y > 0 && y < baba) return t;
    // Otherwise the nearer end cap decides.
    return intersectSphere(rd, y <= 0 ? a : b, r);
  }
  // Looking straight down the axis: only the caps can be hit; take the nearer.
  const ta = intersectSphere(rd, a, r);
  const tb = intersectSphere(rd, b, r);
  if (ta < 0) return tb;
  if (tb < 0) return ta;
  return Math.min(ta, tb);
}

/** Outward unit normal of the capsule at surface point `p`. */
export function capsuleNormal(p: Vec3, a: Vec3, b: Vec3, r: number): Vec3 {
  const bax = b[0] - a[0];
  const bay = b[1] - a[1];
  const baz = b[2] - a[2];
  const pax = p[0] - a[0];
  const pay = p[1] - a[1];
  const paz = p[2] - a[2];
  const baba = bax * bax + bay * bay + baz * baz;
  let h = baba > 0 ? (pax * bax + pay * bay + paz * baz) / baba : 0;
  h = h < 0 ? 0 : h > 1 ? 1 : h;
  return [(pax - h * bax) / r, (pay - h * bay) / r, (paz - h * baz) / r];
}

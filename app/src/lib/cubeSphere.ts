// A cube-sphere mesh: six square grids projected onto the unit sphere, so the
// vertices are spread nearly evenly (a latitude-longitude sphere crowds its
// poles). Positions are unit vectors; a vertex shader can push each out along
// its own direction to shape the surface.

export interface CubeSphere {
  /** x, y, z per vertex, all unit length. */
  positions: Float32Array;
  /** Triangle list; fits 16-bit indices. */
  indices: Uint16Array;
}

/** Largest face size whose six faces still fit in 16-bit indices. */
export const MAX_FACE_VERTICES = 104;

// Each face: its outward axis, then the two axes its grid runs along.
const FACES: [number[], number[], number[]][] = [
  [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 1, 0], [0, 0, -1]],
  [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [0, 0, 1], [-1, 0, 0]],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [1, 0, 0], [0, -1, 0]],
];

/** A cube-sphere with `n` vertices along each face edge. */
export function cubeSphere(n: number): CubeSphere {
  if (n < 2 || n > MAX_FACE_VERTICES) throw new RangeError(`face size must be 2..${MAX_FACE_VERTICES}, got ${n}`);
  const positions = new Float32Array(6 * n * n * 3);
  const indices = new Uint16Array(6 * (n - 1) * (n - 1) * 6);
  let p = 0;
  let q = 0;
  for (let f = 0; f < 6; f++) {
    const [axis, u, v] = FACES[f];
    const base = f * n * n;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = (i / (n - 1)) * 2 - 1;
        const b = (j / (n - 1)) * 2 - 1;
        const x = axis[0] + u[0] * a + v[0] * b;
        const y = axis[1] + u[1] * a + v[1] * b;
        const z = axis[2] + u[2] * a + v[2] * b;
        const len = Math.hypot(x, y, z);
        positions[p++] = x / len;
        positions[p++] = y / len;
        positions[p++] = z / len;
      }
    }
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const a = base + j * n + i;
        const b = a + 1;
        const c = a + n;
        const d = c + 1;
        indices[q++] = a; indices[q++] = c; indices[q++] = b;
        indices[q++] = b; indices[q++] = c; indices[q++] = d;
      }
    }
  }
  return { positions, indices };
}

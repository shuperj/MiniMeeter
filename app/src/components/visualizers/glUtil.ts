// Small WebGL helpers shared by the 3D visualizers: shader building, a
// column-major mat4 camera, and the GLSL "room" every shiny surface reflects.

export function compileShader(gl: WebGLRenderingContext, type: number, source: string, label: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn(`${label} shader:`, gl.getShaderInfoLog(shader));
    return null;
  }
  return shader;
}

/** A linked program, or null (with a console warning) if either shader fails. */
export function createProgram(gl: WebGLRenderingContext, vertex: string, fragment: string, label: string): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertex, label);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragment, label);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn(`${label} shader link:`, gl.getProgramInfoLog(program));
    return null;
  }
  return program;
}

/** Uniform locations by name. */
export function uniformLocations<const N extends readonly string[]>(
  gl: WebGLRenderingContext, program: WebGLProgram, names: N,
): Record<N[number], WebGLUniformLocation | null> {
  const out = {} as Record<N[number], WebGLUniformLocation | null>;
  for (const name of names) out[name as N[number]] = gl.getUniformLocation(program, name);
  return out;
}

export const setColor = (gl: WebGLRenderingContext, loc: WebGLUniformLocation | null, c: readonly [number, number, number]) =>
  gl.uniform3f(loc, c[0], c[1], c[2]);

/** One triangle covering the whole canvas; the vertex shader is `FULLSCREEN_VERTEX`. */
export const FULLSCREEN_VERTEX = `attribute vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;
export function fullscreenBuffer(gl: WebGLRenderingContext): WebGLBuffer | null {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  return buffer;
}

// Column-major mat4 helpers, enough for one camera.
export function perspective(fovY: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}

export function lookAt(e: readonly number[], t: readonly number[], up: readonly number[]): Float32Array {
  let zx = e[0] - t[0], zy = e[1] - t[1], zz = e[2] - t[2];
  let l = Math.hypot(zx, zy, zz);
  zx /= l; zy /= l; zz /= l;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  l = Math.hypot(xx, xy, xz);
  xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  return new Float32Array([
    xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
    -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1,
  ]);
}

export function multiply(a: Float32Array, b: Float32Array): Float32Array {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  }
  return o;
}

/** A camera's basis for ray casting: forward, right and up unit vectors. */
export function cameraBasis(eye: readonly number[], target: readonly number[]): { forward: number[]; right: number[]; up: number[] } {
  let f = [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]];
  const fl = Math.hypot(f[0], f[1], f[2]);
  f = f.map((v) => v / fl);
  const r = [-f[2], 0, f[0]];   // forward x world-up
  const rl = Math.hypot(r[0], r[2]);
  r[0] /= rl; r[2] /= rl;
  const up = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  return { forward: f, right: r, up };
}

/**
 * GLSL: the room a shiny surface reflects, in the palette's lights (expects
 * uniforms uLight, uShadow, uHighlight). Lit from the right, dark on the
 * left, a sharp horizon, a bright window band facing the viewer and a soft
 * ceiling.
 */
export const ROOM_GLSL = `
vec3 room(vec3 r) {
  float side = smoothstep(-0.6, 0.8, r.x);
  float horizon = smoothstep(-0.04, 0.06, r.y);
  float up = smoothstep(0.0, 0.9, r.y);
  vec3 floorC = uShadow * 0.12;
  vec3 skyC = mix(uShadow * 0.8, uLight, side) * (0.45 + 0.55 * up);
  vec3 c = mix(floorC, skyC, horizon);
  float win = exp(-pow((r.y - 0.32) / 0.12, 2.0)) * smoothstep(-0.2, 0.5, r.z);
  c += uHighlight * (win * 1.5 + smoothstep(0.6, 1.0, r.y) * 0.6);
  return c;
}`;

/** GLSL: hash, value noise and fbm over vec2. */
export const NOISE_GLSL = `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 hash2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p) { return noise(p) * 0.5 + noise(p * 2.1 + 7.3) * 0.25 + noise(p * 4.3 + 2.9) * 0.125; }`;

// GPU renderer for the Liquid Metal visualizer. The bead and its drops are
// one ray-marched field (a flattened ellipsoid and spheres joined by a
// smooth minimum), shaded as chrome: the surface reflects the room in the
// palette's lights (glUtil's ROOM_GLSL) and sits on a black glass floor that
// reflects it back. The spray is drawn after it as point sprites, each a
// tiny bead of the same chrome.

import type { MetalDrop, MetalSpeck } from "../../lib/metalSim";
import { MAX_DROPS, MAX_SPECKS } from "../../lib/metalSim";
import type { PaletteLights } from "../../lib/paletteLights";
import {
  createProgram, uniformLocations, setColor, fullscreenBuffer, FULLSCREEN_VERTEX,
  perspective, lookAt, multiply, cameraBasis, ROOM_GLSL,
} from "./glUtil";

export interface MetalGlFrame {
  bodyR: number;
  /** Height of the bead's centre. */
  bodyY: number;
  bodyScale: readonly [number, number, number];
  drops: readonly MetalDrop[];
  specks: readonly MetalSpeck[];
  ripple: number;
  time: number;
  lights: PaletteLights;
}

export interface MetalGl {
  canvas: HTMLCanvasElement;
  resize(w: number, h: number): void;
  render(frame: MetalGlFrame): void;
}

const FOV = (32 * Math.PI) / 180;

const FRAGMENT = `
precision highp float;
precision highp int;
uniform vec2 uSize;
uniform vec3 uEye, uFwd, uRight, uUp;
uniform float uFocal;
uniform vec4 uDrop[${MAX_DROPS}];
uniform int uCount;
uniform vec3 uBody;
uniform vec3 uBodyScale;
uniform float uBodyR;
uniform float uRipple, uTime;
uniform vec3 uFluid, uLight, uShadow, uHighlight, uRim;
${ROOM_GLSL}
float sdEllipsoid(vec3 p, vec3 r) { float k0 = length(p / r); float k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / k1; }
float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
// Distance to the metal: the bead, every drop joined on, and a ripple.
float field(vec3 p) {
  float d = sdEllipsoid(p - uBody, uBodyScale * uBodyR);
  for (int i = 0; i < ${MAX_DROPS}; i++) {
    if (i >= uCount) break;
    vec4 b = uDrop[i];
    d = smin(d, length(p - b.xyz) - b.w, 0.13);
  }
  d += uRipple * sin(p.x * 24.0 + uTime * 9.0) * sin(p.z * 21.0 - uTime * 7.0) * cos(p.y * 17.0 + uTime * 5.0) * 0.012;
  return d;
}
vec3 normalAt(vec3 p) {
  vec2 e = vec2(0.003, 0.0);
  return normalize(vec3(field(p + e.xyy) - field(p - e.xyy), field(p + e.yxy) - field(p - e.yxy), field(p + e.yyx) - field(p - e.yyx)));
}
float march(vec3 ro, vec3 rd, float tmax, int steps) {
  float t = 0.0;
  for (int i = 0; i < 96; i++) {
    if (i >= steps) break;
    float d = field(ro + rd * t);
    if (d < 0.0012) return t;
    t += d * 0.9;
    if (t > tmax) break;
  }
  return -1.0;
}
vec3 chrome(vec3 p, vec3 n, vec3 rd) {
  vec3 R = reflect(rd, n);
  vec3 tint = mix(vec3(1.0), uFluid, 0.65);
  vec3 L1 = normalize(vec3(0.8, 0.5, 0.4));
  float ndv = max(dot(n, -rd), 0.0);
  vec3 c = room(R) * tint * (0.75 + 0.25 * pow(1.0 - ndv, 2.0));
  c += uHighlight * pow(max(dot(R, L1), 0.0), 70.0) * 0.9;
  c += uRim * pow(1.0 - ndv, 4.0) * 0.8;
  c *= 0.55 + 0.45 * smoothstep(0.0, 0.3, p.y);   // darker under the belly
  return c;
}
void main() {
  vec2 ndc = (gl_FragCoord.xy / uSize) * 2.0 - 1.0;
  float aspect = uSize.x / uSize.y;
  vec3 rd = normalize(uFwd * uFocal + uRight * ndc.x * aspect + uUp * ndc.y);
  vec3 ro = uEye;
  float tFloor = rd.y < 0.0 ? -ro.y / rd.y : 1e9;
  float t = march(ro, rd, min(tFloor, 9.0), 96);
  vec3 col = vec3(0.0);
  float a = 0.0;
  if (t > 0.0) {
    vec3 p = ro + rd * t;
    col = chrome(p, normalAt(p), rd);
    a = 1.0;
  } else if (tFloor < 9.0) {
    // Black glass: a dark tint, the bead's contact shadow, and its reflection,
    // fading out toward the edge of the floor.
    vec3 pf = ro + rd * tFloor;
    a = 1.0 - smoothstep(1.35, 1.8, length(pf.xz));
    if (a > 0.001) {
      float occ = clamp(field(pf + vec3(0.0, 0.12, 0.0)) / 0.3, 0.0, 1.0);
      col = uShadow * 0.05 * (0.3 + 0.7 * occ);
      vec3 rr = reflect(rd, vec3(0.0, 1.0, 0.0));
      float tr = march(pf + vec3(0.0, 0.002, 0.0), rr, 6.0, 48);
      if (tr > 0.0) { vec3 pr = pf + rr * tr; col += chrome(pr, normalAt(pr), rr) * 0.4; }
      else col += room(rr) * 0.03;
    }
  }
  gl_FragColor = vec4(col * a, a);
}`;

const SPECK_VERTEX = `
precision highp float;
attribute vec4 aSpeck;   // x, y, z, size
attribute float aLife;
uniform mat4 uViewProj;
uniform float uPx;
varying float vLife;
void main() {
  vec4 c = uViewProj * vec4(aSpeck.xyz, 1.0);
  gl_Position = c;
  gl_PointSize = max(1.5, uPx * aSpeck.w / max(c.w, 0.1));
  vLife = aLife;
}`;

const SPECK_FRAGMENT = `
precision mediump float;
uniform vec3 uLight, uHighlight, uFluid;
varying float vLife;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.5, d) * vLife;
  float hl = smoothstep(0.9, 0.0, length(gl_PointCoord - vec2(0.4, 0.36)) * 2.6);
  vec3 c = mix(mix(uFluid, uLight, 0.5) * 0.75, uHighlight, hl);
  gl_FragColor = vec4(c * a, a);
}`;

/** A WebGL liquid-metal renderer, or null if WebGL isn't available. */
export function createMetalGl(): MetalGl | null {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl", { premultipliedAlpha: true, antialias: false, alpha: true });
  if (!gl) return null;
  const program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT, "Liquid metal");
  const speckProgram = createProgram(gl, SPECK_VERTEX, SPECK_FRAGMENT, "Liquid metal spray");
  if (!program || !speckProgram) return null;

  const u = uniformLocations(gl, program, [
    "uSize", "uEye", "uFwd", "uRight", "uUp", "uFocal", "uDrop", "uCount", "uBody", "uBodyScale", "uBodyR",
    "uRipple", "uTime", "uFluid", "uLight", "uShadow", "uHighlight", "uRim",
  ] as const);
  const su = uniformLocations(gl, speckProgram, ["uViewProj", "uPx", "uLight", "uHighlight", "uFluid"] as const);
  const triangle = fullscreenBuffer(gl);
  const aPos = gl.getAttribLocation(program, "aPos");
  const speckBuffer = gl.createBuffer();
  const lifeBuffer = gl.createBuffer();
  const aSpeck = gl.getAttribLocation(speckProgram, "aSpeck");
  const aLife = gl.getAttribLocation(speckProgram, "aLife");
  const dropData = new Float32Array(MAX_DROPS * 4);
  const speckData = new Float32Array(MAX_SPECKS * 4);
  const lifeData = new Float32Array(MAX_SPECKS);
  let viewProj: Float32Array = new Float32Array(16);
  let focal = 1;
  let height = 1;

  return {
    canvas,
    resize(w, h) {
      canvas.width = w;
      canvas.height = h;
      height = h;
      gl.viewport(0, 0, w, h);
      // Pull back for tall windows so the floor still fits.
      const aspect = w / h;
      const dist = 3.9 * Math.max(1, 1.2 / aspect);
      const eye = [0, 0.3 + dist * Math.sin(0.4), dist * Math.cos(0.4)];
      const target = [0, 0.28, 0];
      const { forward, right, up } = cameraBasis(eye, target);
      focal = 1 / Math.tan(FOV / 2);
      gl.useProgram(program);
      gl.uniform2f(u.uSize, w, h);
      setColor(gl, u.uEye, eye as [number, number, number]);
      setColor(gl, u.uFwd, forward as [number, number, number]);
      setColor(gl, u.uRight, right as [number, number, number]);
      setColor(gl, u.uUp, up as [number, number, number]);
      gl.uniform1f(u.uFocal, focal);
      viewProj = multiply(perspective(FOV, aspect, 0.1, 50), lookAt(eye, target, [0, 1, 0]));
    },
    render({ bodyR, bodyY, bodyScale, drops, specks, ripple, time, lights }) {
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, triangle);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      gl.uniform3f(u.uBody, 0, bodyY, 0);
      gl.uniform3f(u.uBodyScale, bodyScale[0], bodyScale[1], bodyScale[2]);
      gl.uniform1f(u.uBodyR, bodyR);
      const count = Math.min(MAX_DROPS, drops.length);
      for (let i = 0; i < count; i++) {
        const d = drops[i];
        dropData.set([d.x, d.y, d.z, d.r], i * 4);
      }
      gl.uniform4fv(u.uDrop, dropData);
      gl.uniform1i(u.uCount, count);
      gl.uniform1f(u.uRipple, ripple);
      gl.uniform1f(u.uTime, time);
      setColor(gl, u.uFluid, lights.fluid);
      setColor(gl, u.uLight, lights.light);
      setColor(gl, u.uShadow, lights.shadow);
      setColor(gl, u.uHighlight, lights.highlight);
      setColor(gl, u.uRim, lights.rim);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      const n = Math.min(MAX_SPECKS, specks.length);
      if (n === 0) return;
      gl.useProgram(speckProgram);
      gl.disableVertexAttribArray(aPos);
      for (let i = 0; i < n; i++) {
        const s = specks[i];
        speckData.set([s.x, s.y, s.z, s.size], i * 4);
        lifeData[i] = 1 - s.age / s.life;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, speckBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, speckData, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(aSpeck);
      gl.vertexAttribPointer(aSpeck, 4, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, lifeBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, lifeData, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(aLife);
      gl.vertexAttribPointer(aLife, 1, gl.FLOAT, false, 0, 0);
      gl.uniformMatrix4fv(su.uViewProj, false, viewProj);
      gl.uniform1f(su.uPx, focal * height);
      setColor(gl, su.uLight, lights.light);
      setColor(gl, su.uHighlight, lights.highlight);
      setColor(gl, su.uFluid, lights.fluid);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.POINTS, 0, n);
      gl.disable(gl.BLEND);
      gl.disableVertexAttribArray(aSpeck);
      gl.disableVertexAttribArray(aLife);
    },
  };
}

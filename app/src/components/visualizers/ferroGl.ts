// GPU renderer for the Ferrofluid visualizer. The surface is a cube-sphere
// mesh pushed out along each vertex's direction by the spikes (see
// lib/ferroSim), then scaled into a puddle or a ball. The fragment shader
// rebuilds the surface normal from three nearby samples of the same surface
// function and shades a glossy liquid in the palette's colours (see
// lib/ferroLights). It draws into its own offscreen WebGL canvas, which the
// scene copies onto its 2D canvas, like the Lava Lamp.

import { cubeSphere } from "../../lib/cubeSphere";
import type { FerroSite } from "../../lib/ferroSim";
import type { FerroLights } from "../../lib/ferroLights";
import type { CelEdges } from "../../types/style";

export interface FerroGlFrame {
  sites: readonly FerroSite[];
  /** Body scale along x, y, z (lib/ferroSim's bodyScale). */
  scale: readonly [number, number, number];
  /** 0 = puddle .. 1 = ball. */
  gather: number;
  lights: FerroLights;
  /** Cel-shade in 3D (flat tone bands, ink outlines) with this edge colour; null for the glossy look. */
  cel: CelEdges | null;
}

export interface FerroGl {
  canvas: HTMLCanvasElement;
  resize(w: number, h: number): void;
  render(frame: FerroGlFrame): void;
}

/** Length of a full spike, in ball radii. */
export const SPIKE_LENGTH = 0.55;
/** The camera sits this far above the ball's equator. */
export const CAMERA_ELEVATION = (24 * Math.PI) / 180;
const FOV = (30 * Math.PI) / 180;
const FACE_VERTICES = 88;

const surfaceGlsl = (maxSites: number) => `
uniform vec4 uSpike[${maxSites}];   // unit direction xyz, length
uniform int uCount;
uniform vec3 uScale;
uniform float uGather;
const float SPIKE_LENGTH = ${SPIKE_LENGTH};
// Total spike length in direction d (a unit vector): a cone per spike with
// concave flanks and a sharp tip, by chord distance on the unit sphere.
float spikes(vec3 d) {
  float r = 0.0;
  for (int i = 0; i < ${maxSites}; i++) {
    if (i >= uCount) break;
    vec4 s = uSpike[i];
    float dd = distance(d, s.xyz);
    float w = 0.23 + 0.15 * min(s.w / SPIKE_LENGTH, 1.0);
    if (dd < w) { float t = 1.0 - dd / w; r += s.w * pow(t, 2.6); }
  }
  return r;
}
// The surface point for direction d: the scaled body plus the spike standing
// on it. On the ball spikes radiate along the surface normal; on the puddle
// they stand up out of the top, and the underside has none.
vec3 surf(vec3 d) {
  float len = spikes(d);
  vec3 n = normalize(d / uScale);
  vec3 dir = normalize(mix(vec3(0.0, 1.0, 0.0), n, mix(0.15, 1.0, uGather)));
  len *= mix(smoothstep(0.1, 0.6, d.y), 1.0, uGather);
  return d * uScale + dir * len;
}
`;

const vertex = (maxSites: number) => `
precision highp float;
precision highp int;
attribute vec3 aPos;
uniform mat4 uViewProj;
${surfaceGlsl(maxSites)}
varying vec3 vDir;
varying vec3 vWorld;
varying float vSpike;
void main() {
  vec3 d = normalize(aPos);
  vDir = d;
  vSpike = spikes(d);
  vWorld = surf(d);
  gl_Position = uViewProj * vec4(vWorld, 1.0);
}`;

const fragment = (maxSites: number) => `
precision highp float;
precision highp int;
${surfaceGlsl(maxSites)}
uniform vec3 uCam;
uniform vec3 uFluid;
uniform vec3 uLight;
uniform vec3 uShadow;
uniform vec3 uHighlight;
uniform vec3 uRim;
uniform float uCel;      // 1 = cel-shaded
uniform vec3 uInk;       // cel outline colour
varying vec3 vDir;
varying vec3 vWorld;
varying float vSpike;
void main() {
  vec3 d = normalize(vDir);
  // Surface normal from three nearby points on the displaced surface.
  vec3 t1 = normalize(cross(abs(d.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0), d));
  vec3 t2 = cross(d, t1);
  float e = 0.004;
  vec3 p0 = surf(d);
  vec3 p1 = surf(normalize(d + t1 * e));
  vec3 p2 = surf(normalize(d + t2 * e));
  vec3 n = normalize(cross(p1 - p0, p2 - p0));
  if (dot(n, normalize(d / uScale)) < 0.0) n = -n;

  vec3 V = normalize(uCam - vWorld);
  vec3 L1 = normalize(vec3(0.8, 0.45, 0.4));     // the light: right, a little above, in front
  vec3 L3 = normalize(vec3(-0.35, 0.7, -0.6));   // rim: behind, upper left
  float ndv = max(dot(n, V), 0.0);

  // Three tones: the lit side on the right takes the light's colour, the
  // far side on the left the shadow's, and the fluid itself shows between.
  bool cel = uCel > 0.5;
  float facing = dot(n, L1);
  float lit = smoothstep(-0.05, 0.75, facing);
  float shade = smoothstep(-0.05, 0.75, -facing);
  float valley = clamp(vSpike / 0.15, 0.0, 1.0);
  if (cel) {
    // Flat tone bands with hard edges between them.
    lit = step(0.3, facing);
    shade = step(0.3, -facing);
    valley = step(0.5, valley);
  }
  vec3 body = mix(uFluid, uLight, lit * 0.6);
  body = mix(body, uShadow, shade * 0.8);
  body *= (0.65 + 0.4 * lit) * (1.0 - 0.3 * shade);
  // The bare surface between spikes sits a little in shadow.
  body *= 0.65 + 0.35 * valley;

  // Gloss: a Fresnel reflection of a bright window band and a soft ceiling,
  // the hotspot of the light, and the rim light from behind.
  float fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
  vec3 Rv = reflect(-V, n);
  float win = exp(-pow((Rv.y - 0.38) / 0.11, 2.0)) * smoothstep(-0.3, 0.4, Rv.z);
  float ceiling = smoothstep(0.25, 0.95, Rv.y) * 0.35;
  vec3 H1 = normalize(L1 + V);
  vec3 H3 = normalize(L3 + V);
  float s1 = pow(max(dot(n, H1), 0.0), 90.0) * 0.9;
  float sheen = pow(max(dot(n, H1), 0.0), 8.0) * 0.15;
  float s3 = pow(max(dot(n, H3), 0.0), 24.0) * 0.9;
  if (cel) {
    // A flat hotspot and a flat reflection band; no soft sheen.
    s1 = step(0.4, s1) * 0.9;
    sheen = 0.0;
    win = step(0.5, win);
    ceiling = 0.0;
    fres = step(0.45, fres) * 0.6;
    s3 = step(0.4, s3) * 0.9;
  }
  vec3 col = body + uHighlight * ((win + ceiling) * fres + s1 + sheen) + uRim * s3;
  if (cel) {
    // Ink where the surface turns away from the viewer: silhouettes and the
    // flanks of every spike.
    float ink = 1.0 - smoothstep(0.06, 0.17, ndv);
    col = mix(col, uInk, ink);
  }
  gl_FragColor = vec4(min(col, vec3(1.0)), 1.0);
}`;

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn("Ferrofluid shader:", gl.getShaderInfoLog(shader));
    return null;
  }
  return shader;
}

// Column-major mat4 helpers, enough for one camera.
function perspective(fovY: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}

function lookAt(e: number[], t: number[], up: number[]): Float32Array {
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

function multiply(a: Float32Array, b: Float32Array): Float32Array {
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

/**
 * A camera above the ball's equator, pulled back so the ball and its longest
 * spikes fill the frame whatever the window's shape.
 */
function fitCamera(aspect: number): { viewProj: Float32Array; eye: number[] } {
  const reach = 1 + SPIKE_LENGTH * 0.95;
  const half = Math.min(FOV / 2, Math.atan(Math.tan(FOV / 2) * aspect));
  const dist = reach / Math.sin(half * 0.96);
  const eye = [0, dist * Math.sin(CAMERA_ELEVATION), dist * Math.cos(CAMERA_ELEVATION)];
  const viewProj = multiply(perspective(FOV, aspect, 0.1, 50), lookAt(eye, [0, 0, 0], [0, 1, 0]));
  return { viewProj, eye };
}

/** A WebGL ferrofluid renderer, or null if WebGL isn't available. */
export function createFerroGl(maxSites: number): FerroGl | null {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl", { premultipliedAlpha: true, antialias: true, alpha: true, depth: true });
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, vertex(maxSites));
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragment(maxSites));
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn("Ferrofluid shader link:", gl.getProgramInfoLog(program));
    return null;
  }
  gl.useProgram(program);

  const mesh = cubeSphere(FACE_VERTICES);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
  gl.enable(gl.DEPTH_TEST);

  const u = (name: string) => gl.getUniformLocation(program, name);
  const loc = {
    viewProj: u("uViewProj"), spike: u("uSpike"), count: u("uCount"), scale: u("uScale"), gather: u("uGather"),
    cam: u("uCam"), fluid: u("uFluid"), light: u("uLight"), shadow: u("uShadow"),
    highlight: u("uHighlight"), rim: u("uRim"), cel: u("uCel"), ink: u("uInk"),
  };
  const spikeData = new Float32Array(maxSites * 4);
  const setColor = (location: WebGLUniformLocation | null, c: readonly [number, number, number]) =>
    gl.uniform3f(location, c[0], c[1], c[2]);

  return {
    canvas,
    resize(w, h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      const cam = fitCamera(w / h);
      gl.uniformMatrix4fv(loc.viewProj, false, cam.viewProj);
      gl.uniform3f(loc.cam, cam.eye[0], cam.eye[1], cam.eye[2]);
    },
    render({ sites, scale, gather, lights, cel }) {
      const count = Math.min(maxSites, sites.length);
      for (let i = 0; i < count; i++) {
        const s = sites[i];
        spikeData.set([s.rx, s.ry, s.rz, s.h * SPIKE_LENGTH], i * 4);
      }
      gl.uniform4fv(loc.spike, spikeData);
      gl.uniform1i(loc.count, count);
      gl.uniform3f(loc.scale, scale[0], scale[1], scale[2]);
      gl.uniform1f(loc.gather, gather);
      setColor(loc.fluid, lights.fluid);
      setColor(loc.light, lights.light);
      setColor(loc.shadow, lights.shadow);
      setColor(loc.highlight, lights.highlight);
      setColor(loc.rim, lights.rim);
      gl.uniform1f(loc.cel, cel ? 1 : 0);
      const ink = cel === "light" ? 1 : 0.03;
      gl.uniform3f(loc.ink, ink, ink, ink);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
    },
  };
}

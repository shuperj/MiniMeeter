// GPU renderer for the Terrain visualizer. A grid mesh is shaped in the
// vertex shader from the row history (lib/terrainSim) held in a texture,
// plus random rolling hills that scroll with it. The fragment shader draws
// it as a contour map in one of two materials, Paper (matte, grained) or
// Flooded (mirror water drowning the valleys), optionally in a splinter
// camouflage painted with the palette's own colours.

import type { TerrainState } from "../../lib/terrainSim";
import { ROWS, COLS, VISIBLE, newestRow, rowFraction, waterLevel } from "../../lib/terrainSim";
import type { PaletteLights } from "../../lib/paletteLights";
import type { CelEdges, TerrainMaterial, TerrainPattern } from "../../types/style";
import {
  createProgram, uniformLocations, setColor, perspective, lookAt, multiply, fullscreenBuffer, FULLSCREEN_VERTEX,
  ROOM_GLSL, NOISE_GLSL,
} from "./glUtil";

export interface TerrainGlFrame {
  state: TerrainState;
  material: TerrainMaterial;
  pattern: TerrainPattern;
  lights: PaletteLights;
  /** Cel-shade in the shader (flat light bands, ink on the contour lines); null for the plain look. */
  cel: CelEdges | null;
}

export interface TerrainGl {
  canvas: HTMLCanvasElement;
  resize(w: number, h: number): void;
  render(frame: TerrainGlFrame): void;
}

/** Vertices along each edge of the ground mesh. */
const GRID = 150;
/** Half the width of the land, and its depth, in world units. */
const XW = 1.9;
const ZW = 4.2;
/**
 * The scroll distance wraps every this many rows (105 ground units, ~96 s)
 * so the shader's floats stay precise however long the app runs. Every noise
 * term is periodic in exactly that distance, so the wrap is seamless.
 */
export const SCROLL_PERIOD_ROWS = 1200;
const EYE = [0, 1.45, 1.55];
const TARGET = [0, 0.1, -1.05];
const FOV = (50 * Math.PI) / 180;

// The land's height, shared by both shaders: the vertex shader shapes the
// mesh with it, the fragment shader evaluates it again per pixel for the
// contour lines, so they are exact iso-lines rather than lines through a
// mesh's interpolation (which swims as the land slides under the grid).
const HEIGHT_GLSL = `
uniform sampler2D uHist;
uniform float uNewest, uFrac, uAmp, uRowAbs;
const float COLS = ${COLS}.0, ROWS = ${ROWS}.0, VISIBLE = ${VISIBLE}.0, XW = ${XW}, ZW = ${ZW};
const float PERIOD = ${SCROLL_PERIOD_ROWS}.0 * (ZW / VISIBLE);   // ground units per wrap
${NOISE_GLSL}
// Value noise that repeats every py cells along y, so it is seamless where
// the scroll distance wraps (py = frequency x PERIOD, a whole number).
float pnoise(vec2 p, float py) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float y0 = mod(i.y, py), y1 = mod(i.y + 1.0, py);
  return mix(mix(hash(vec2(i.x, y0)), hash(vec2(i.x + 1.0, y0)), f.x), mix(hash(vec2(i.x, y1)), hash(vec2(i.x + 1.0, y1)), f.x), f.y);
}
// Ground coordinates of a grid point: across in world units, and the row's
// distance in the same units (wrapped every PERIOD), so patterns and hills
// move with the land. At the very front the distance back dips below zero:
// that reads the live row ahead of the newest (lib/terrainSim), so the
// front edge never steps.
vec2 ground(vec2 q) {
  float back = q.y * VISIBLE - uFrac;
  return vec2((q.x - 0.5) * 2.0 * XW, mod(uRowAbs - back, ${SCROLL_PERIOD_ROWS}.0) * (ZW / VISIBLE));
}
// One row's height at u: the two nearest columns, blended here. The hardware
// filter blends with 8-bit weights, which makes the land a fine staircase
// across: invisible as shape, but the contour widths (fwidth) and the normals
// see every step, and the steep slopes and ridges shimmer as the land slides.
float rowAt(float u, float row) {
  float x = clamp(u * COLS - 0.5, 0.0, COLS - 1.0);
  float c0 = floor(x);
  float c1 = min(c0 + 1.0, COLS - 1.0);
  float v = (row + 0.5) / ROWS;
  return mix(texture2D(uHist, vec2((c0 + 0.5) / COLS, v)).r, texture2D(uHist, vec2((c1 + 0.5) / COLS, v)).r, x - c0);
}
float height(vec2 q) {
  float back = q.y * VISIBLE - uFrac;
  // Catmull-Rom across four rows: the surface and its slope move smoothly
  // as the land scrolls, where a linear blend kinks at every row centre.
  float r = uNewest - back;
  float r0 = floor(r);
  float t = r - r0;
  float top = uNewest + 1.0;   // the live row; nothing newer exists yet
  float hm = rowAt(q.x, r0 - 1.0);
  float h0 = rowAt(q.x, r0);
  float h1 = rowAt(q.x, min(r0 + 1.0, top));
  float h2 = rowAt(q.x, min(r0 + 2.0, top));
  float h = 0.5 * (2.0 * h0 + (h1 - hm) * t + (2.0 * hm - 5.0 * h0 + 4.0 * h1 - h2) * t * t + (3.0 * h0 - hm - 3.0 * h1 + h2) * t * t * t);
  h *= uAmp;
  vec2 g = ground(q);
  // Rolling hills (three octaves) and a little grain, so the contours wander
  // like a hand-drawn map. Each frequency x PERIOD is a whole number of cells.
  float hills = pnoise(g * 0.8, 0.8 * PERIOD) * 0.5 + pnoise(g * 1.6 + 7.3, 1.6 * PERIOD) * 0.25 + pnoise(g * 3.2 + 2.9, 3.2 * PERIOD) * 0.125;
  h += (hills - 0.45) * 0.3;
  h += (pnoise(g * 4.0, 4.0 * PERIOD) - 0.5) * 0.02;
  return h;
}`;

const VERTEX = `
precision highp float;
precision highp int;
attribute vec2 aPos;            // x -1..1 across, y 0..1 near to far
uniform mat4 uViewProj;
uniform float uWater;
uniform float uFlat;            // 1 = draw the water plane instead of the land
varying float vH;
varying vec3 vN;
varying vec3 vW;
varying vec2 vG;
varying vec2 vQ;
${HEIGHT_GLSL}
void main() {
  vec2 q = vec2(aPos.x * 0.5 + 0.5, aPos.y);
  float h = height(q);
  float e = 1.0 / ${GRID}.0;
  float hx1 = height(q + vec2(e, 0.0)), hx0 = height(q - vec2(e, 0.0));
  float hz1 = height(q + vec2(0.0, e)), hz0 = height(q - vec2(0.0, e));
  vec3 dx = vec3(2.0 * e * XW, hx1 - hx0, 0.0);
  vec3 dz = vec3(0.0, hz1 - hz0, -2.0 * e * ZW);
  vN = normalize(cross(dx, dz));
  vH = h;
  // The water is the same grid, flat at the water level; the depth test
  // then cuts the shoreline exactly where the land breaks the surface.
  vW = vec3(aPos.x * XW, uFlat > 0.5 ? uWater : h, -aPos.y * ZW + 1.3);
  vG = ground(q);
  vQ = q;
  gl_Position = uViewProj * vec4(vW, 1.0);
}`;

const FRAGMENT = `
#extension GL_OES_standard_derivatives : enable
precision highp float;
precision highp int;
uniform vec3 uFluid, uLight, uShadow, uHighlight, uRim;
uniform vec3 uSwatch[5];
uniform int uSwatchCount;
uniform vec3 uEye;
uniform float uTime, uWater, uBass;
uniform int uMaterial, uPattern;
uniform float uCel;      // 1 = cel-shaded
uniform vec3 uInk;       // cel outline colour
uniform float uFlat;
varying float vH;
varying vec3 vN;
varying vec3 vW;
varying vec2 vG;
varying vec2 vQ;
${HEIGHT_GLSL}
${ROOM_GLSL}
vec3 swatch(float t) {   // 0..1 -> one of the palette's colours
  int i = int(floor(clamp(t, 0.0, 0.999) * float(uSwatchCount)));
  for (int k = 0; k < 5; k++) if (k == i) return uSwatch[k];
  return uSwatch[0];
}
// Splinter camouflage: angular Voronoi fragments, with smaller fragments
// cut into some of them; which colour, as 0..1 over the swatches.
float camo(vec2 g) {
  vec2 p = g * 1.3;
  vec2 ip = floor(p), fp = fract(p);
  float best = 8.0;
  vec2 bestCell = vec2(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(float(x), float(y));
    vec2 r = o + hash2(ip + o) - fp;
    float d = abs(r.x) * 0.9 + abs(r.y) * 1.1 + max(abs(r.x), abs(r.y)) * 0.3;
    if (d < best) { best = d; bestCell = ip + o; }
  }
  float t = hash(bestCell * 1.7);
  vec2 p2 = g * 3.4;
  vec2 ip2 = floor(p2), fp2 = fract(p2);
  float best2 = 8.0;
  vec2 cell2 = vec2(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(float(x), float(y));
    vec2 r = o + hash2(ip2 + o + 3.1) - fp2;
    float d = abs(r.x) + abs(r.y) * 1.2;
    if (d < best2) { best2 = d; cell2 = ip2 + o; }
  }
  if (hash(cell2 * 0.37 + 9.2) > 0.68) t = hash(cell2 * 2.3);
  return t;
}
void main() {
  vec3 n = normalize(vN);
  vec3 V = normalize(uEye - vW);
  vec3 L = normalize(vec3(0.7, 0.75, 0.35));
  vec3 H = normalize(L + V);
  float diff = max(dot(n, L), 0.0);
  bool cel = uCel > 0.5;
  // Cel: three flat bands of light instead of a smooth slope.
  if (cel) diff = floor(diff * 3.0 + 0.5) / 3.0;
  float t = clamp(vH / 0.75, 0.0, 1.0);

  // Contour lines every 0.05 of height, every fifth one heavier, from the
  // exact height at this pixel.
  float hp = height(vQ);
  float step1 = 0.05;
  float f = fract(hp / step1);
  float d = min(f, 1.0 - f) * step1;
  float fw = max(fwidth(hp), 1e-4);
  // Each edge fades over a full pixel: any sharper and the edges step, and
  // the steps crawl along the lines as the land slides.
  float line = 1.0 - smoothstep(fw * 0.15, fw * 1.15, d);
  float f5 = fract(hp / (step1 * 5.0));
  float d5 = min(f5, 1.0 - f5) * step1 * 5.0;
  float heavy = 1.0 - smoothstep(fw * 0.65, fw * 1.65, d5);
  line = max(line * 0.5, heavy * 0.9);
  // Where lines would crowd closer than a few pixels (steep slopes, the far
  // distance) they alias into a shimmer; let them fade out there instead.
  line *= 1.0 - smoothstep(0.2, 0.45, fw / step1);

  // The ground's own colour: by height, or the camouflage.
  vec3 albedo = mix(uFluid * 0.5, uLight * 0.75, t);
  if (uPattern == 1) albedo = swatch(camo(vG)) * 0.8;
  vec3 col;
  if (uFlat > 0.5) {
    // Water: the fluid colour, lighter in the shallows, the room reflected
    // in a surface that ripples with the bass, foam along the shore. The
    // exact height of the land under this pixel sets the depth and the foam.
    float depthH = uWater - hp;
    if (depthH < 0.0) discard;
    vec2 rp = vG * 9.0 + uTime * vec2(0.6, 0.4);
    float amp = 0.08 + 0.3 * uBass;
    vec3 wn = normalize(vec3((noise(rp) - 0.5) * amp, 1.0, (noise(rp + 3.7) - 0.5) * amp));
    float fres = 0.08 + 0.92 * pow(1.0 - max(dot(wn, V), 0.0), 5.0);
    float depth = clamp(depthH / 0.12, 0.0, 1.0);
    vec3 deep = mix(uFluid * 0.5, uFluid * 0.12, depth);
    if (cel) fres = step(0.5, fres) * 0.7;
    col = mix(deep, room(reflect(-V, wn)) * 0.8, fres) + uHighlight * pow(max(dot(wn, H), 0.0), 90.0) * 0.9;
    float foam = (1.0 - smoothstep(0.0, 0.015, depthH)) * (0.6 + 0.4 * noise(vG * 40.0 + uTime));
    col = mix(col, cel ? uInk : uHighlight * 0.85, foam * 0.7);
  } else {
    // Paper: matte with a fine grain, lines in the highlight colour, peaks tinted by the rim.
    // Each octave of grain fades to its mean once its cells shrink to a pixel
    // or two; finer than that it only sparkles as the land slides.
    float gfw = max(fwidth(vG.x), fwidth(vG.y));
    float g60 = 1.0 - smoothstep(0.4, 0.7, 60.0 * gfw), g140 = 1.0 - smoothstep(0.25, 0.5, 140.0 * gfw);
    float grain = cel ? 0.5 : 0.5 + (noise(vG * 60.0) - 0.5) * 0.5 * g60 + (noise(vG * 140.0) - 0.5) * 0.5 * g140;
    vec3 matte = mix(uShadow * 0.3, albedo, 0.25 + 0.75 * diff) * (0.9 + 0.2 * grain);
    // Cel draws its own lines in ink, on the map's own contours, rather than
    // hunting for edges in the picture afterwards.
    col = mix(matte, cel ? uInk : uHighlight, line * (cel ? 0.95 : 0.85)) + uRim * smoothstep(0.5, 0.9, t) * 0.5;
    if (uMaterial == 1) {
      float shore = 1.0 - smoothstep(0.0, 0.015, hp - uWater);
      col = mix(col, cel ? uInk : uHighlight * 0.8, shore * 0.5);
    }
  }
  // Haze with distance into the sky's tint, and a soft edge at the sides and the far end.
  float fog = smoothstep(-0.8, -2.9, vW.z);
  float edge = (1.0 - smoothstep(1.5, 1.9, abs(vW.x))) * (1.0 - smoothstep(-2.4, -2.9, vW.z));
  col = mix(col, uShadow * 0.3, fog * 0.7);
  float a = edge * (1.0 - fog * 0.6);
  gl_FragColor = vec4(col * a, a);
}`;

// The sky: a faint tint behind the land, deeper toward the horizon, so the
// window has something above the hills (and the title bar's glass something
// to blur).
const SKY_FRAGMENT = `
precision mediump float;
uniform vec2 uSize;
uniform vec3 uShadow, uLight;
void main() {
  float y = gl_FragCoord.y / uSize.y;          // 0 bottom .. 1 top
  float horizon = smoothstep(0.95, 0.45, y);   // strongest low, fading up
  vec3 c = mix(uShadow * 0.35, uLight * 0.12, 1.0 - horizon);
  float a = 0.25 + 0.4 * horizon;
  gl_FragColor = vec4(c * a, a);
}`;

/** A WebGL terrain renderer, or null if WebGL isn't available. */
export function createTerrainGl(): TerrainGl | null {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl", { premultipliedAlpha: true, antialias: true, alpha: true, depth: true });
  if (!gl) return null;
  // Contour lines need screen-space derivatives; without them, no lines (and no renderer).
  if (!gl.getExtension("OES_standard_derivatives")) return null;
  const program = createProgram(gl, VERTEX, FRAGMENT, "Terrain");
  const skyProgram = createProgram(gl, FULLSCREEN_VERTEX, SKY_FRAGMENT, "Terrain sky");
  if (!program || !skyProgram) return null;
  const skyBuffer = fullscreenBuffer(gl);
  const aSky = gl.getAttribLocation(skyProgram, "aPos");
  const sky = uniformLocations(gl, skyProgram, ["uSize", "uShadow", "uLight"] as const);
  gl.useProgram(program);

  const n = GRID;
  const verts = new Float32Array(n * n * 2);
  const indices = new Uint16Array((n - 1) * (n - 1) * 6);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      verts[(j * n + i) * 2] = (i / (n - 1)) * 2 - 1;
      verts[(j * n + i) * 2 + 1] = j / (n - 1);
    }
  }
  let k = 0;
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      indices[k++] = a; indices[k++] = c; indices[k++] = b;
      indices[k++] = b; indices[k++] = c; indices[k++] = d;
    }
  }
  const gridBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, gridBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, "aPos");
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

  // The row history (RGBA so every driver takes it; height is in R). Read
  // texel by texel: the shader does its own blending (rowAt).
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, COLS, ROWS, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(COLS * ROWS * 4));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

  const u = uniformLocations(gl, program, [
    "uViewProj", "uHist", "uNewest", "uFrac", "uAmp", "uRowAbs", "uWater", "uBass", "uEye", "uTime",
    "uMaterial", "uPattern", "uSwatch", "uSwatchCount", "uFluid", "uLight", "uShadow", "uHighlight", "uRim",
    "uCel", "uInk", "uFlat",
  ] as const);
  gl.uniform1i(u.uHist, 0);
  setColor(gl, u.uEye, EYE as [number, number, number]);
  const swatchData = new Float32Array(15);
  let uploadedImage: Uint8Array | null = null;

  return {
    canvas,
    resize(w, h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      // Widen the view for tall windows so the land still fills them.
      const aspect = w / h;
      const viewProj = multiply(perspective(FOV * Math.max(1, 1.15 / aspect), aspect, 0.1, 30), lookAt(EYE, TARGET, [0, 1, 0]));
      gl.useProgram(program);
      gl.uniformMatrix4fv(u.uViewProj, false, viewProj);
      gl.useProgram(skyProgram);
      gl.uniform2f(sky.uSize, w, h);
    },
    render({ state, material, pattern, lights, cel }) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      // The sky first, without depth, then the land over it.
      gl.disable(gl.DEPTH_TEST);
      gl.useProgram(skyProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, skyBuffer);
      gl.enableVertexAttribArray(aSky);
      gl.vertexAttribPointer(aSky, 2, gl.FLOAT, false, 0, 0);
      setColor(gl, sky.uShadow, lights.shadow);
      setColor(gl, sky.uLight, lights.light);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disableVertexAttribArray(aSky);

      gl.enable(gl.DEPTH_TEST);
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, gridBuffer);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      // Upload the rows written since last time (all of them after a new state).
      if (uploadedImage !== state.image) {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, COLS, ROWS, gl.RGBA, gl.UNSIGNED_BYTE, state.image);
        uploadedImage = state.image;
      } else {
        for (const row of state.dirty) {
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, row, COLS, 1, gl.RGBA, gl.UNSIGNED_BYTE, state.image.subarray(row * COLS * 4, (row + 1) * COLS * 4));
        }
      }
      state.dirty.length = 0;

      gl.uniform1f(u.uNewest, newestRow(state));
      gl.uniform1f(u.uFrac, rowFraction(state));
      gl.uniform1f(u.uRowAbs, (state.rows - 1) % SCROLL_PERIOD_ROWS);
      gl.uniform1f(u.uAmp, state.amp);
      gl.uniform1f(u.uTime, state.time);
      gl.uniform1f(u.uBass, state.bass);
      gl.uniform1i(u.uMaterial, material === "flooded" ? 1 : 0);
      gl.uniform1i(u.uPattern, pattern === "splinter" ? 1 : 0);
      gl.uniform1f(u.uWater, material === "flooded" ? waterLevel(state) : -10);
      const sw = lights.swatches;
      for (let i = 0; i < 5; i++) swatchData.set(sw[Math.min(i, sw.length - 1)], i * 3);
      gl.uniform3fv(u.uSwatch, swatchData);
      gl.uniform1i(u.uSwatchCount, sw.length);
      setColor(gl, u.uFluid, lights.fluid);
      setColor(gl, u.uLight, lights.light);
      setColor(gl, u.uShadow, lights.shadow);
      setColor(gl, u.uHighlight, lights.highlight);
      setColor(gl, u.uRim, lights.rim);
      gl.uniform1f(u.uCel, cel ? 1 : 0);
      const ink = cel === "light" ? 1 : 0.03;
      gl.uniform3f(u.uInk, ink, ink, ink);
      gl.uniform1f(u.uFlat, 0);
      gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
      if (material === "flooded") {
        // The water plane over the land; the depth test keeps the land that breaks the surface.
        gl.uniform1f(u.uFlat, 1);
        gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
      }
    },
  };
}

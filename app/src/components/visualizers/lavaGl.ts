// GPU renderer for the Lava Lamp: the same metaball field, height-map
// shading and color blending as the CPU path in LavaLampVisualizer, as a
// WebGL fragment shader, so the lamp can render at full resolution for next
// to no CPU. It draws into its own offscreen WebGL canvas, which the scene
// then copies onto its 2D canvas (a GPU-to-GPU copy), so nothing else in the
// visualizer pipeline changes.

import type { Metaball } from "../../lib/metaballs";
import type { Rgb } from "../../lib/color";

export interface LavaGlFrame {
  balls: readonly Metaball[];
  /** Color per ball (0..255), used when `multi`. */
  colors: readonly Rgb[];
  multi: boolean;
  base: Rgb;
  hot: Rgb;
  poolLine: number;
  poolR2: number;
  bump: number;
  /** 0..1 */
  maxAlpha: number;
}

export interface LavaGl {
  canvas: HTMLCanvasElement;
  resize(w: number, h: number): void;
  render(frame: LavaGlFrame): void;
}

const VERTEX = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const fragment = (maxBalls: number) => `
precision highp float;
#define MAX_BALLS ${maxBalls}
uniform vec2 uSize;
uniform vec4 uBall[MAX_BALLS];      // x, y, r, core softening (pixels, y down)
uniform vec2 uInvStretch[MAX_BALLS];
uniform vec3 uColor[MAX_BALLS];     // 0..255
uniform int uCount;
uniform float uMulti;
uniform vec3 uBase;
uniform vec3 uHot;
uniform float uPoolLine;
uniform float uPoolR2;
uniform float uBump;
uniform float uMaxAlpha;

const float HEIGHT_K = 1.0;
// Edge fades over about 1 / EDGE_SHARPNESS pixels.
const float EDGE_SHARPNESS = 0.3;
// Pixels well outside every blob are skipped early.
const float CULL = 0.6;
const vec3 LIGHT = vec3(-0.4834, -0.6983, 0.6446);  // normalize(-0.45, -0.65, 0.6)

void main() {
  vec2 p = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);
  float f = 0.0;
  vec2 g = vec2(0.0);
  vec3 tint = vec3(0.0);
  for (int i = 0; i < MAX_BALLS; i++) {
    if (i >= uCount) break;
    vec4 b = uBall[i];
    vec2 is = uInvStretch[i];
    vec2 d = (p - b.xy) * is;
    // Softened core (see lib/metaballs): no seam or spike at a ball's center.
    float d2 = max(dot(d, d) + b.w, 1e-6);
    float c = b.z * b.z / d2;
    f += c;
    g += (-2.0 * c / d2) * d * is;
    tint += uColor[i] * c;
  }
  // The pool: field falling off with distance above a line below the canvas.
  float above = min(-0.5, p.y - uPoolLine);
  float pool = uPoolR2 / (above * above);
  f += pool;
  g.y -= 2.0 * pool / above;
  tint += uBase * pool;

  if (f <= CULL) { gl_FragColor = vec4(0.0); return; }

  // Height map h = 1 - exp(-K (f - 1)): it rises steeply at the rim and levels
  // off inside, so wherever blobs have merged the surface reads as one smooth
  // mass instead of a bump (and a highlight) per blob. Slope = h'(f) grad f.
  float inv = uBump * HEIGHT_K * exp(-HEIGHT_K * max(f - 1.0, 0.0));
  vec3 n = normalize(vec3(-g * inv, 1.0));
  vec3 halfV = normalize(LIGHT + vec3(0.0, 0.0, 1.0));
  float diffuse = max(0.0, dot(n, LIGHT));
  float spec = pow(max(0.0, dot(n, halfV)), 32.0);
  float rim = (1.0 - n.z) * (1.0 - n.z);

  vec3 base = uMulti > 0.5 ? tint / f : uBase;
  vec3 hot = uMulti > 0.5 ? base + (255.0 - base) * 0.45 : uHot;
  float lit = 0.3 + diffuse * 0.7;
  // Clean, anti-aliased edge: (f - 1) / |grad f| is roughly the distance to
  // the surface in pixels, so the edge fades over a few px at any blob size.
  float edge = clamp((f - 1.0) / max(length(g), 1e-5) * EDGE_SHARPNESS + 0.5, 0.0, 1.0);
  vec3 rgb = min((base * lit + hot * rim * 0.6 + 255.0 * spec * 0.9) / 255.0, vec3(1.0));
  // The highlight only exists on the surface, so it fades with the edge too.
  float a = min(1.0, edge * (uMaxAlpha + spec * 160.0 / 255.0));
  gl_FragColor = vec4(rgb * a, a);  // premultiplied
}
`;

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn("Lava shader:", gl.getShaderInfoLog(shader));
    return null;
  }
  return shader;
}

/** A WebGL lava renderer, or null if WebGL isn't available (use the CPU path). */
export function createLavaGl(maxBalls: number): LavaGl | null {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl", { premultipliedAlpha: true, antialias: false, alpha: true });
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragment(maxBalls));
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn("Lava shader link:", gl.getProgramInfoLog(program));
    return null;
  }
  gl.useProgram(program);

  // One triangle covering the whole canvas.
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const u = (name: string) => gl.getUniformLocation(program, name);
  const loc = {
    size: u("uSize"), ball: u("uBall"), invStretch: u("uInvStretch"), color: u("uColor"),
    count: u("uCount"), multi: u("uMulti"), base: u("uBase"), hot: u("uHot"),
    poolLine: u("uPoolLine"), poolR2: u("uPoolR2"), bump: u("uBump"), maxAlpha: u("uMaxAlpha"),
  };
  const ballData = new Float32Array(maxBalls * 4);
  const stretchData = new Float32Array(maxBalls * 2);
  const colorData = new Float32Array(maxBalls * 3);

  return {
    canvas,
    resize(w, h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(loc.size, w, h);
    },
    render(frame) {
      const count = Math.min(maxBalls, frame.balls.length);
      for (let i = 0; i < count; i++) {
        const b = frame.balls[i];
        ballData.set([b.x, b.y, b.r, b.soft ?? 0.05 * b.r * b.r], i * 4);
        stretchData.set([1 / (b.sx ?? 1), 1 / (b.sy ?? 1)], i * 2);
        colorData.set(frame.colors[i] ?? frame.base, i * 3);
      }
      gl.uniform4fv(loc.ball, ballData);
      gl.uniform2fv(loc.invStretch, stretchData);
      gl.uniform3fv(loc.color, colorData);
      gl.uniform1i(loc.count, count);
      gl.uniform1f(loc.multi, frame.multi ? 1 : 0);
      gl.uniform3f(loc.base, frame.base[0], frame.base[1], frame.base[2]);
      gl.uniform3f(loc.hot, frame.hot[0], frame.hot[1], frame.hot[2]);
      gl.uniform1f(loc.poolLine, frame.poolLine);
      gl.uniform1f(loc.poolR2, frame.poolR2);
      gl.uniform1f(loc.bump, frame.bump);
      gl.uniform1f(loc.maxAlpha, frame.maxAlpha);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}

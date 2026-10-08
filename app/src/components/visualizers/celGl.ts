// The Cel filter: a WebGL pass over a finished visualizer frame that flattens
// its colours into a few bands (hue kept, brightness quantised) and draws an
// outline wherever brightness or coverage changes sharply, in a dark or a
// light ink. It reads the scene's 2D canvas as a texture and draws into the
// canvas it is given, which is shown in the scene's place.

import type { CelEdges } from "../../types/style";

export interface CelGl {
  canvas: HTMLCanvasElement;
  resize(w: number, h: number): void;
  render(source: HTMLCanvasElement, edges: CelEdges): void;
}

/** Brightness bands. */
const LEVELS = 4;

const VERTEX = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAGMENT = `
precision mediump float;
uniform sampler2D uTex;
uniform vec2 uSize;
uniform vec2 uTexel;
uniform vec3 uInk;
const float LEVELS = ${LEVELS}.0;

float bright(vec2 uv) {
  vec4 c = texture2D(uTex, uv);
  // Coverage counts too, so a shape's silhouette against nothing gets a line.
  return dot(c.rgb, vec3(0.299, 0.587, 0.114)) * c.a;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  vec4 c = texture2D(uTex, uv);
  float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  // Each band's centre, so even the dimmest pixels keep their colour.
  float q = (floor(l * LEVELS) + 0.5) / LEVELS;
  vec3 rgb = l > 0.002 ? c.rgb * (q / l) : c.rgb;

  // Sobel over the 3x3 neighbourhood.
  vec2 t = uTexel;
  float tl = bright(uv + vec2(-t.x,  t.y)), tc = bright(uv + vec2(0.0,  t.y)), tr = bright(uv + vec2( t.x,  t.y));
  float ml = bright(uv + vec2(-t.x,  0.0)),                                    mr = bright(uv + vec2( t.x,  0.0));
  float bl = bright(uv + vec2(-t.x, -t.y)), bc = bright(uv + vec2(0.0, -t.y)), br = bright(uv + vec2( t.x, -t.y));
  float gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
  float gy = (bl + 2.0 * bc + br) - (tl + 2.0 * tc + tr);
  float edge = smoothstep(0.15, 0.35, length(vec2(gx, gy)));

  // Coverage in bands too, so soft fades become hard-edged steps.
  float a = c.a < 0.1 ? c.a : (floor(c.a * LEVELS) + 0.5) / LEVELS;
  a = max(a, edge);
  rgb = mix(rgb, uInk, edge);
  gl_FragColor = vec4(min(rgb, vec3(1.0)) * a, a);  // premultiplied
}
`;

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn("Cel shader:", gl.getShaderInfoLog(shader));
    return null;
  }
  return shader;
}

/**
 * A WebGL cel pass drawing into `canvas`, or null if WebGL isn't available
 * (the frame then shows unfiltered).
 */
export function createCelGl(canvas: HTMLCanvasElement): CelGl | null {
  const gl = canvas.getContext("webgl", { premultipliedAlpha: true, antialias: false, alpha: true, depth: false });
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn("Cel shader link:", gl.getProgramInfoLog(program));
    return null;
  }
  gl.useProgram(program);

  // One triangle covering the whole canvas.
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  // The 2D canvas is top-down; flip so uv matches gl_FragCoord.
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  const loc = {
    tex: gl.getUniformLocation(program, "uTex"),
    size: gl.getUniformLocation(program, "uSize"),
    texel: gl.getUniformLocation(program, "uTexel"),
    ink: gl.getUniformLocation(program, "uInk"),
  };
  gl.uniform1i(loc.tex, 0);

  return {
    canvas,
    resize(w, h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(loc.size, w, h);
      gl.uniform2f(loc.texel, 1 / w, 1 / h);
    },
    render(source, edges) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      const ink = edges === "light" ? 1 : 0.03;
      gl.uniform3f(loc.ink, ink, ink, ink);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}

import VisualizerCanvas, { type Scene, type VisualizerProps } from "./VisualizerCanvas";
import { createBandGroups } from "../../lib/spectrumBands";
import { SPECTRUM_BANDS } from "../../hooks/useSpectrum";
import { bodyScale, createFerro, stepFerro, SITE_COUNT, type FerroState } from "../../lib/ferroSim";
import { ferroLights, type FerroLights } from "../../lib/ferroLights";
import { createFerroGl, CAMERA_ELEVATION, SPIKE_LENGTH } from "./ferroGl";

function createFerrofluid(ctx: CanvasRenderingContext2D): Scene {
  // One band per spike site; the sim picks each site's band by latitude.
  const bands = createBandGroups(SPECTRUM_BANDS);
  const state = createFerro();
  // Shade on the GPU when possible; else a flat sketch of the same state.
  const gl = createFerroGl(SITE_COUNT);
  let paletteSource: readonly string[] | null = null;
  let lights: FerroLights | null = null;

  return {
    resize(w, h) {
      if (gl && w > 0 && h > 0) gl.resize(w, h);
    },

    draw({ w, h, dt, motion, level, reactivity, palette, spectrum }) {
      const { groups, bass, mid, treble, onset } = bands(spectrum, level, dt);
      if (palette !== paletteSource) {
        paletteSource = palette;
        lights = ferroLights(palette);
      }
      // The bass carries most of the weight: it is what drives the magnet.
      const loudness = Math.min(1, bass * 0.7 + mid * 0.6 + treble * 0.4);
      // Physics (lib/ferroSim) runs on `motion`, so Speed slows or hurries it.
      stepFerro(state, motion, { level: loudness, bands: groups, onset, reactivity });

      ctx.clearRect(0, 0, w, h);
      if (gl) {
        gl.render({ sites: state.sites, scale: bodyScale(state), gather: state.gather, lights: lights! });
        ctx.drawImage(gl.canvas, 0, 0);
        return;
      }
      drawFlat(ctx, w, h, state, lights!);
    },
  };
}

const rgb = (c: readonly [number, number, number], a = 1) =>
  `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;

/**
 * CPU fallback without WebGL: the body as a shaded ellipse and each visible
 * spike as a triangle, projected the way the camera would see them.
 */
function drawFlat(ctx: CanvasRenderingContext2D, w: number, h: number, state: FerroState, lights: FerroLights) {
  const [sx, sy, sz] = bodyScale(state);
  const cosE = Math.cos(CAMERA_ELEVATION);
  const sinE = Math.sin(CAMERA_ELEVATION);
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) * 0.3;
  const rx = R * sx;
  const ry = R * Math.hypot(sy * cosE, sz * sinE);

  // Lit from the right, shadowed on the left, the fluid's colour between.
  const mixc = (a: readonly number[], b: readonly number[], t: number): [number, number, number] =>
    [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const body = ctx.createLinearGradient(cx - rx, cy, cx + rx, cy);
  body.addColorStop(0, rgb(mixc(lights.fluid, lights.shadow, 0.8).map((v) => v * 0.7) as [number, number, number]));
  body.addColorStop(0.45, rgb(lights.fluid));
  body.addColorStop(1, rgb(mixc(lights.fluid, lights.light, 0.6)));
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgb(lights.highlight, 0.5);
  ctx.lineWidth = Math.max(1, R * 0.015);
  ctx.stroke();

  ctx.fillStyle = rgb(lights.fluid);
  ctx.strokeStyle = rgb(lights.highlight, 0.8);
  for (const s of state.sites) {
    if (s.h < 0.03) continue;
    // Facing the camera, or on the far side.
    const depth = s.ry * sinE + s.rz * cosE;
    if (depth < -0.15) continue;
    // Spike direction: the body's surface normal, upright on the puddle.
    const g = state.gather;
    let nx = (s.rx / sx) * g;
    let ny = (s.ry / sy) * g + (1 - g);
    let nz = (s.rz / sz) * g;
    const nl = Math.hypot(nx, ny, nz);
    nx /= nl; ny /= nl; nz /= nl;
    const px = nx;
    const py = -(ny * cosE - nz * sinE);
    const pl = Math.hypot(px, py);
    if (pl < 0.05) continue;
    const len = s.h * SPIKE_LENGTH * R * pl * (g + (1 - g) * Math.max(0, s.ry));
    if (len < 1) continue;
    const bx = cx + s.rx * sx * R;
    const by = cy - (s.ry * sy * cosE - s.rz * sz * sinE) * R;
    const ux = px / pl;
    const uy = py / pl;
    const half = R * 0.07;
    ctx.beginPath();
    ctx.moveTo(bx - uy * half, by + ux * half);
    ctx.lineTo(bx + ux * len, by + uy * len);
    ctx.lineTo(bx + uy * half, by - ux * half);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.3 + 0.5 * Math.max(0, ux * 0.6 - uy * 0.8);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

export default function FerrofluidVisualizer(props: VisualizerProps) {
  // Full resolution: the shading runs on the GPU (see ferroGl).
  return <VisualizerCanvas {...props} createScene={createFerrofluid} />;
}

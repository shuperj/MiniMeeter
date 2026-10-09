import VisualizerCanvas, { type Scene, type VisualizerProps } from "./VisualizerCanvas";
import { createBandGroups } from "../../lib/spectrumBands";
import { createMetal, stepMetal, metalBodyScale, BODY_HEIGHT, type MetalState } from "../../lib/metalSim";
import { paletteLights, type PaletteLights } from "../../lib/paletteLights";
import { createMetalGl } from "./metalGl";

function createLiquidMetal(ctx: CanvasRenderingContext2D): Scene {
  const bands = createBandGroups(3);
  const state = createMetal();
  // Ray-march on the GPU when possible; else a flat sketch of the same state.
  const gl = createMetalGl();
  let paletteSource: readonly string[] | null = null;
  let lights: PaletteLights | null = null;

  return {
    resize(w, h) {
      if (gl && w > 0 && h > 0) gl.resize(w, h);
    },

    draw({ w, h, dt, motion, level, reactivity, palette, spectrum }) {
      const { bass, mid, treble, onset } = bands(spectrum, level, dt);
      if (palette !== paletteSource) {
        paletteSource = palette;
        lights = paletteLights(palette);
      }
      const loudness = Math.min(1, bass * 0.7 + mid * 0.6 + treble * 0.4);
      // Physics (lib/metalSim) runs on `motion`, so Speed slows or hurries it.
      stepMetal(state, motion, { level: loudness, bass, mid, treble, onset, reactivity });

      ctx.clearRect(0, 0, w, h);
      if (gl) {
        gl.render({
          bodyR: state.bodyR, bodyY: state.bodyR * BODY_HEIGHT, bodyScale: metalBodyScale(state),
          drops: state.drops, specks: state.specks, ripple: state.ripple, time: state.time, lights: lights!,
        });
        ctx.drawImage(gl.canvas, 0, 0);
        return;
      }
      drawFlat(ctx, w, h, state, lights!);
    },
  };
}

const rgb = (c: readonly [number, number, number], a = 1) =>
  `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;

/** CPU fallback without WebGL: the bead and its drops as shaded discs, the spray as dots. */
function drawFlat(ctx: CanvasRenderingContext2D, w: number, h: number, state: MetalState, lights: PaletteLights) {
  const unit = Math.min(w, h) * 0.3;
  const cx = w / 2;
  const floorY = h * 0.72;
  const [sx, sy] = metalBodyScale(state);
  const disc = (x: number, y: number, rx: number, ry: number) => {
    const g = ctx.createRadialGradient(x - rx * 0.35, y - ry * 0.4, 0, x, y, Math.max(rx, ry) * 1.2);
    g.addColorStop(0, rgb(lights.highlight, 0.9));
    g.addColorStop(0.35, rgb(lights.light, 0.8));
    g.addColorStop(0.8, rgb(lights.shadow));
    g.addColorStop(1, "rgb(6,7,10)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  // Depth: things further away (larger z) draw first, a little higher and smaller.
  const project = (x: number, y: number, z: number) => ({ px: cx + x * unit, py: floorY - y * unit * 0.9 - z * unit * 0.35, s: 1 - z * 0.08 });
  const items: { z: number; draw: () => void }[] = [];
  items.push({ z: 0, draw: () => { const p = project(0, state.bodyR * BODY_HEIGHT, 0); disc(p.px, p.py, state.bodyR * sx * unit, state.bodyR * sy * unit); } });
  for (const d of state.drops) items.push({ z: d.z, draw: () => { const p = project(d.x, d.y, d.z); disc(p.px, p.py, d.r * unit * p.s, d.r * unit * p.s); } });
  items.sort((a, b) => b.z - a.z);
  for (const i of items) i.draw();
  ctx.fillStyle = rgb(lights.highlight, 0.8);
  for (const s of state.specks) {
    const p = project(s.x, s.y, s.z);
    ctx.globalAlpha = 1 - s.age / s.life;
    ctx.fillRect(p.px - 1, p.py - 1, 2, 2);
  }
  ctx.globalAlpha = 1;
}

export default function LiquidMetalVisualizer(props: VisualizerProps) {
  // Full resolution: the ray marching runs on the GPU (see metalGl).
  return <VisualizerCanvas {...props} createScene={createLiquidMetal} />;
}

import VisualizerCanvas, { type Scene, type VisualizerProps } from "./VisualizerCanvas";
import { createBandGroups } from "../../lib/spectrumBands";

/** Waves for a single color; a palette gets a count that shares out evenly. */
const DEFAULT_WAVES = 5;
const MAX_WAVES = 6;

/** Wave count that gives every palette color the same number of waves. */
function waveCount(colors: number): number {
  if (colors <= 1) return DEFAULT_WAVES;
  return colors <= 3 ? colors * 2 : colors;
}

/** Horizontal spacing of wave sample points, in pixels. */
const STEP = 2;

/**
 * "Waves": layered sine ribbons. Each wave follows one slice of the spectrum,
 * back (top) = bass to front (bottom) = treble, swelling and brightening with
 * it, and takes its own palette color.
 */
function createWaves(ctx: CanvasRenderingContext2D): Scene {
  let time = 0;
  const bands = createBandGroups(MAX_WAVES);
  // Wave heights at each sample point, shared by the fill and the crest line.
  let ys = new Float32Array(0);

  return {
    resize(w) {
      ys = new Float32Array(Math.floor(w / STEP) + 1);
    },

    draw({ w, h, dt, motion, level, reactivity, palette, spectrum }) {
      const { groups } = bands(spectrum, level, dt);
      time += 0.007 * motion;

      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1.5;

      const n = ys.length;

      const count = waveCount(palette.length);
      for (let i = 0; i < count; i++) {
        // Back (top) wave follows the bass, front (bottom) the treble.
        const e = groups[Math.floor((i * MAX_WAVES) / count)] * reactivity;
        const phase = (i / count) * Math.PI * 2;
        // Spread down the canvas so each wave's color has room of its own.
        const baseY = h * (0.2 + (i * 0.6) / Math.max(1, count - 1));
        const amp = h * (0.03 + e * 0.06) * (5 / count) * (1 + i * 0.1);
        const freq = 0.003 + i * 0.001;
        const speed = time * (0.8 + i * 0.3);
        const waveAlpha = Math.min(1, 0.16 + e * 0.35);

        for (let k = 0; k < n; k++) {
          const x = k * STEP;
          ys[k] =
            baseY +
            Math.sin(x * freq + speed + phase) * amp +
            Math.sin(x * freq * 2.3 + speed * 0.7 + phase * 1.5) * amp * 0.3 +
            Math.cos(x * freq * 0.5 + speed * 1.3) * amp * 0.2;
        }

        // Each wave takes the next palette color (all the same for one color).
        const rgb = palette[i % palette.length];

        // Filled body: strong color at the crest fading out within a short
        // band below it, so the waves in front don't bury the ones behind.
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let k = 0; k < n; k++) ctx.lineTo(k * STEP, ys[k]);
        ctx.lineTo(w, h);
        ctx.closePath();
        const gradient = ctx.createLinearGradient(0, baseY - amp, 0, baseY + amp + h * 0.07);
        gradient.addColorStop(0, `rgba(${rgb},${waveAlpha})`);
        gradient.addColorStop(0.5, `rgba(${rgb},${waveAlpha * 0.35})`);
        gradient.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = gradient;
        ctx.globalAlpha = 1;
        // Additive, so where waves cross their colors mix instead of the
        // front wave hiding the one behind it.
        ctx.globalCompositeOperation = "lighter";
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";

        // Crest line in the wave's own color.
        ctx.beginPath();
        ctx.moveTo(0, ys[0]);
        for (let k = 1; k < n; k++) ctx.lineTo(k * STEP, ys[k]);
        ctx.strokeStyle = `rgb(${rgb})`;
        ctx.globalAlpha = Math.min(1, 0.35 + e * 0.6);
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
    },
  };
}

export default function XmbSmokeVisualizer(props: VisualizerProps) {
  return <VisualizerCanvas {...props} createScene={createWaves} />;
}

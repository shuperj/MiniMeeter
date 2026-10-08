import VisualizerCanvas, { type Scene, type VisualizerProps } from "./VisualizerCanvas";
import { createBandGroups } from "../../lib/spectrumBands";

interface Blob {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  phase: number;
}

const NUM_BLOBS = 5;

const clamp255 = (v: number) => Math.min(255, Math.max(0, v));

function createGradientMesh(ctx: CanvasRenderingContext2D): Scene {
  let time = 0;
  const bands = createBandGroups(NUM_BLOBS);

  const blobs: Blob[] = [];
  for (let i = 0; i < NUM_BLOBS; i++) {
    blobs.push({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) * 0.002,
      vy: (Math.random() - 0.5) * 0.002,
      radius: 0.2 + Math.random() * 0.15,
      phase: Math.random() * Math.PI * 2,
    });
  }

  // Per-blob colors only change with the visualizer color, so derive them
  // once per color rather than every frame.
  let paletteSource: readonly string[] | null = null;
  let colors: string[] = [];
  const ensureColors = (palette: readonly string[]) => {
    if (palette === paletteSource) return;
    paletteSource = palette;
    // A user palette colors the blobs directly.
    if (palette.length > 1) {
      colors = blobs.map((_, i) => palette[i % palette.length]);
      return;
    }
    const [accentR, accentG, accentB] = palette[0].split(",").map((v) => parseInt(v) || 0);
    colors = blobs.map((_, i) => {
      // Color variation per blob
      const hueShift = i * 40;
      const r = clamp255(accentR + hueShift * (i % 2 === 0 ? 1 : -1));
      const g = clamp255(accentG + (i - 2) * 20);
      const b = clamp255(accentB + (i % 3) * 15);
      return `${r},${g},${b}`;
    });
  };

  return {
    draw({ w, h, dt, motion, level, reactivity, palette, spectrum }) {
      // Each blob follows one slice of the spectrum, low to high.
      const { groups } = bands(spectrum, level, dt);
      time += 0.0065 * motion;
      ensureColors(palette);

      ctx.clearRect(0, 0, w, h);

      // Compositing: lighter blend for overlapping glows
      ctx.globalCompositeOperation = "lighter";
      const speedMult = 1.25 * motion;

      for (let i = 0; i < blobs.length; i++) {
        const blob = blobs[i];

        // Gentle orbital motion
        blob.x += blob.vx * speedMult + Math.sin(time + blob.phase) * 0.001 * speedMult;
        blob.y += blob.vy * speedMult + Math.cos(time * 0.7 + blob.phase) * 0.001 * speedMult;

        // Bounce off edges with soft wrap
        if (blob.x < -0.1) blob.vx = Math.abs(blob.vx);
        if (blob.x > 1.1) blob.vx = -Math.abs(blob.vx);
        if (blob.y < -0.1) blob.vy = Math.abs(blob.vy);
        if (blob.y > 1.1) blob.vy = -Math.abs(blob.vy);

        const bx = blob.x * w;
        const by = blob.y * h;
        const e = groups[i] * reactivity;
        const pulse = 1 + Math.sin(time * 2 + blob.phase) * 0.1 + e * 0.3;
        const br = blob.radius * Math.min(w, h) * pulse;
        const baseAlpha = Math.min(0.6, 0.09 + e * 0.14);

        const c = colors[i];
        const gradient = ctx.createRadialGradient(bx, by, 0, bx, by, br);
        gradient.addColorStop(0, `rgba(${c},${baseAlpha})`);
        gradient.addColorStop(0.4, `rgba(${c},${baseAlpha * 0.6})`);
        gradient.addColorStop(1, `rgba(${c},0)`);

        ctx.fillStyle = gradient;
        ctx.fillRect(bx - br, by - br, br * 2, br * 2);
      }

      ctx.globalCompositeOperation = "source-over";
    },
  };
}

export default function GradientMeshVisualizer(props: VisualizerProps) {
  // Nothing but soft gradients, so half resolution is indistinguishable and a
  // quarter of the pixels to fill.
  return <VisualizerCanvas {...props} createScene={createGradientMesh} resolution={0.5} />;
}

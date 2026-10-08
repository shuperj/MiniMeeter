import VisualizerCanvas, { type Scene, type VisualizerProps } from "./VisualizerCanvas";
import { createBandGroups } from "../../lib/spectrumBands";

const NUM_RINGS = 6;

function createGeometricPulse(ctx: CanvasRenderingContext2D): Scene {
  let time = 0;
  const bands = createBandGroups(NUM_RINGS);
  // Each ring's angle is accumulated frame by frame. Computing it as
  // time × (level-dependent speed) made the rings jump whenever the level
  // changed, since time keeps growing.
  const angles = new Float32Array(NUM_RINGS);

  const drawPolygon = (
    cx: number, cy: number, radius: number,
    sides: number, rotation: number,
  ) => {
    ctx.beginPath();
    for (let i = 0; i <= sides; i++) {
      const angle = (i / sides) * Math.PI * 2 + rotation;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };

  return {
    draw({ w, h, dt, motion, level, reactivity, palette, spectrum }) {
      // One spectrum group per ring: the outer ring follows the bass, the
      // inner ring the treble.
      const { groups, bass } = bands(spectrum, level, dt);
      time += 0.008 * motion;

      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const maxRadius = Math.min(w, h) * 0.45;

      // Solid colors (rings alternate through the palette); per-shape
      // transparency goes through globalAlpha so no rgba() strings are built
      // and parsed per shape.

      for (let i = 0; i < NUM_RINGS; i++) {
        const progress = (i + 1) / NUM_RINGS;
        const baseRadius = progress * maxRadius;
        const e = groups[NUM_RINGS - 1 - i] * reactivity;

        // A slow breath of its own, pushed outward by its band.
        const pulse = 1 + Math.sin(time * 2 + i * 0.8) * 0.04 + e * 0.18;
        const radius = baseRadius * pulse;

        // Alternate between shapes: hex, triangle, square...
        const sides = i % 3 === 0 ? 6 : i % 3 === 1 ? 3 : 4;

        // Rotation: each ring rotates at its own rate, alternating direction
        const dir = i % 2 === 0 ? 1 : -1;
        angles[i] += 0.0032 * dir * (1 + i * 0.1) * motion;
        const rotation = angles[i];

        // Outer rings a little more transparent; loud bands light up.
        const alpha = Math.min(1, (0.18 + e * 0.35) * (1 - progress * 0.4));

        ctx.strokeStyle = `rgb(${palette[i % palette.length]})`;
        drawPolygon(cx, cy, radius, sides, rotation);
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 1 + (1 - progress) * 1.5 + e * 2;
        ctx.stroke();

        // Glow line while the band is active — same path, wider and fainter
        if (e > 0.15) {
          ctx.globalAlpha = alpha * 0.3;
          ctx.lineWidth = 3 + e * 4;
          ctx.stroke();
        }
      }

      // Center dot that thumps with the bass
      const kick = bass * reactivity;
      const dotSize = 2.5 + kick * 6;
      ctx.globalAlpha = Math.min(1, 0.35 + kick * 0.5);
      ctx.fillStyle = `rgb(${palette[0]})`;
      ctx.beginPath();
      ctx.arc(cx, cy, dotSize, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 1;
    },
  };
}

export default function GeometricPulseVisualizer(props: VisualizerProps) {
  return <VisualizerCanvas {...props} createScene={createGeometricPulse} />;
}

import VisualizerCanvas, { type Scene, type VisualizerProps } from "./VisualizerCanvas";
import { bucketOf } from "../../lib/frameLoop";
import { createBandGroups } from "../../lib/spectrumBands";

interface Star {
  x: number;
  y: number;
  z: number;
}

const MAX_STARS = 300;
/** Streak length, in 60 Hz frames of travel. */
const TRAIL_FRAMES = 7;

/**
 * Stars are grouped by depth, which sets both their alpha and their tint, so
 * each depth band is one fill (and one streak stroke) instead of one per star.
 * With 10 bands the accent/white split at depth 0.6 falls on a band edge.
 */
const DEPTH_BANDS = 10;
const ACCENT_BAND = 6;

/** Marks a star that respawned this frame and isn't drawn. */
const HIDDEN = 255;

function createStarfield(ctx: CanvasRenderingContext2D): Scene {
  const bands = createBandGroups(1);
  const stars: Star[] = [];
  const respawn = (star: Star) => {
    star.x = (Math.random() - 0.5) * 2;
    star.y = (Math.random() - 0.5) * 2;
    star.z = 1;
  };
  for (let i = 0; i < MAX_STARS; i++) {
    stars.push({
      x: (Math.random() - 0.5) * 2,
      y: (Math.random() - 0.5) * 2,
      z: Math.random(),
    });
  }

  // Per-frame screen positions, reused across frames.
  const sx = new Float32Array(MAX_STARS);
  const sy = new Float32Array(MAX_STARS);
  const radius = new Float32Array(MAX_STARS);
  const band = new Uint8Array(MAX_STARS);

  return {
    draw({ w, h, dt, motion, level, reactivity, palette, spectrum }) {
      const cx = w / 2;
      const cy = h / 2;
      const { groups, bass, treble } = bands(spectrum, level, dt);

      // Warp: a steady cruise (the Speed setting) plus a push from the bass.
      const step = 0.0035 * motion + bass * reactivity * 0.012 * dt;
      // Speed per 60 Hz frame. Each streak covers the last TRAIL_FRAMES of a
      // star's travel, drawn fresh every frame: trails come from the star's
      // speed, not from leftover pixels, so they look the same at any frame
      // rate (no beading at 30 fps, no haze at 240).
      const speed = dt > 0 ? step / dt : 0;
      const trail = speed * TRAIL_FRAMES;

      ctx.clearRect(0, 0, w, h);

      const sizeScale = 1.5 + groups[0] * reactivity * 2;

      for (let i = 0; i < MAX_STARS; i++) {
        const star = stars[i];
        star.z -= step;
        if (star.z <= 0.001) respawn(star);

        const x = cx + (star.x / star.z) * cx;
        const y = cy + (star.y / star.z) * cy;
        if (x < 0 || x > w || y < 0 || y > h) {
          respawn(star);
          band[i] = HIDDEN;
          continue;
        }

        const depth = 1 - star.z;
        sx[i] = x;
        sy[i] = y;
        radius[i] = Math.max(0.5, depth * sizeScale);
        band[i] = bucketOf(depth, DEPTH_BANDS);
      }

      // Treble makes the stars glitter.
      const alphaScale = Math.min(1.2, 0.6 + treble * reactivity * 0.45);

      for (let b = 0; b < DEPTH_BANDS; b++) {
        const depth = (b + 0.5) / DEPTH_BANDS;
        const alpha = depth * alphaScale;
        const tinted = b >= ACCENT_BAND;

        // Near stars are tinted (spread across the palette), far stars stay
        // white. One streak stroke and one dot fill per band and color.
        const tints = tinted ? palette.length : 1;
        for (let c = 0; c < tints; c++) {
          const color = tinted ? `rgb(${palette[c]})` : "#fff";
          const visible = (i: number) => band[i] === b && (!tinted || i % tints === c);

          ctx.beginPath();
          let any = false;
          for (let i = 0; i < MAX_STARS; i++) {
            if (!visible(i)) continue;
            const star = stars[i];
            const prevZ = star.z + trail;
            ctx.moveTo(cx + (star.x / prevZ) * cx, cy + (star.y / prevZ) * cy);
            ctx.lineTo(sx[i], sy[i]);
            any = true;
          }
          if (!any) continue;
          ctx.strokeStyle = color;
          ctx.globalAlpha = alpha * 0.45;
          ctx.lineWidth = Math.max(0.4, depth * sizeScale * 0.7);
          ctx.stroke();

          ctx.beginPath();
          for (let i = 0; i < MAX_STARS; i++) {
            if (!visible(i)) continue;
            ctx.moveTo(sx[i] + radius[i], sy[i]);
            ctx.arc(sx[i], sy[i], radius[i], 0, Math.PI * 2);
          }
          ctx.fillStyle = color;
          ctx.globalAlpha = Math.min(1, tinted ? alpha : alpha * 0.8);
          ctx.fill();
        }
      }

      ctx.globalAlpha = 1;
    },
  };
}

export default function StarfieldVisualizer(props: VisualizerProps) {
  return <VisualizerCanvas {...props} createScene={createStarfield} />;
}

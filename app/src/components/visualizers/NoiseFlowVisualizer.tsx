import VisualizerCanvas, { type Scene, type VisualizerProps } from "./VisualizerCanvas";
import { bucketOf, createTrailFade } from "../../lib/frameLoop";
import { createBandGroups } from "../../lib/spectrumBands";

interface Particle {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  life: number;
}

const MAX_PARTICLES = 400;

/**
 * Segments are grouped by remaining life into this many alpha levels, so the
 * whole field is a handful of stroke() calls instead of one per particle.
 */
const ALPHA_BUCKETS = 8;

/** Marks a particle that respawned this frame and has no segment to draw. */
const NO_SEGMENT = 255;

// Simple hash-based noise for flow field (fast, no dependency)
function noise2d(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function smoothNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const n00 = noise2d(ix, iy);
  const n10 = noise2d(ix + 1, iy);
  const n01 = noise2d(ix, iy + 1);
  const n11 = noise2d(ix + 1, iy + 1);
  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

function createNoiseFlow(ctx: CanvasRenderingContext2D): Scene {
  const fade = createTrailFade(0.04);
  let time = 0;
  const bands = createBandGroups(1);

  const respawn = (p: Particle) => {
    p.x = Math.random();
    p.y = Math.random();
    p.prevX = p.x;
    p.prevY = p.y;
    p.life = 0.5 + Math.random() * 0.5;
  };

  const particles: Particle[] = [];
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const p = { x: 0, y: 0, prevX: 0, prevY: 0, life: 0 };
    respawn(p);
    particles.push(p);
  }
  const buckets = new Uint8Array(MAX_PARTICLES);

  return {
    draw({ w, h, dt, motion, level, reactivity, palette, spectrum }) {
      // Bass drives the flow, mids stir up turbulence, treble brightens it.
      const { bass, mid, treble } = bands(spectrum, level, dt);
      time += 0.004 * motion + bass * reactivity * 0.006 * dt;

      // Fade trail
      // Fade the trails; held back at high frame rates until it's strong
      // enough to survive 8-bit rounding (see createTrailFade).
      const fadeAlpha = fade(dt);
      if (fadeAlpha > 0) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = `rgba(0,0,0,${fadeAlpha})`;
        ctx.fillRect(0, 0, w, h);
      }

      const noiseScale = 3.5 + mid * reactivity * 2.5;
      const particleSpeed = 0.004 * motion + bass * reactivity * 0.008 * dt;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.prevX = p.x;
        p.prevY = p.y;

        // Flow field angle from noise
        const angle = smoothNoise(p.x * noiseScale + time * 5, p.y * noiseScale + time * 3) * Math.PI * 4;

        p.x += Math.cos(angle) * particleSpeed;
        p.y += Math.sin(angle) * particleSpeed;
        p.life -= 0.002 * motion;

        // Reset if out of bounds or dead
        if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1 || p.life <= 0) {
          respawn(p);
          buckets[i] = NO_SEGMENT;
        } else {
          buckets[i] = bucketOf(p.life, ALPHA_BUCKETS);
        }
      }

      const maxAlpha = Math.min(1, 0.25 + treble * reactivity * 0.3);
      ctx.lineWidth = 0.8 + bass * reactivity * 0.8;

      // Particles are spread across the palette colors; one stroke per
      // alpha bucket and color.
      const colors = palette.length;
      for (let c = 0; c < colors; c++) {
        ctx.strokeStyle = `rgb(${palette[c]})`;
        for (let b = 0; b < ALPHA_BUCKETS; b++) {
          ctx.beginPath();
          let any = false;
          for (let i = c; i < particles.length; i += colors) {
            if (buckets[i] !== b) continue;
            const p = particles[i];
            ctx.moveTo(p.prevX * w, p.prevY * h);
            ctx.lineTo(p.x * w, p.y * h);
            any = true;
          }
          if (!any) continue;
          ctx.globalAlpha = maxAlpha * (b + 0.5) / ALPHA_BUCKETS;
          ctx.stroke();
        }
      }

      ctx.globalAlpha = 1;
    },
  };
}

export default function NoiseFlowVisualizer(props: VisualizerProps) {
  return <VisualizerCanvas {...props} createScene={createNoiseFlow} />;
}

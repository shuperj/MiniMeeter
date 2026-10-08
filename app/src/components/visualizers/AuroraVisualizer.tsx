import VisualizerCanvas, { type Scene, type VisualizerProps } from "./VisualizerCanvas";
import { createLevelEnvelope } from "../../lib/levelEnvelope";
import { perFrameAlpha } from "../../lib/frameLoop";
import { parseRgb, saturationShades } from "../../lib/color";
import { SPECTRUM_BANDS } from "../../hooks/useSpectrum";

/**
 * Angular sections of the ring. Each has its own energy and breaks up on its
 * own, the way each arc of Plexamp's ring follows one slice of the spectrum.
 */
const SECTIONS = 48;
/**
 * The band is two rows of small square blocks. Each section holds two blocks
 * per row; at rest they join up into a solid ring.
 */
const ROWS = 2;
const PER_ROW = 2;
const DASHES = ROWS * PER_ROW;
const TOTAL = SECTIONS * DASHES;
/** Blocks around the circle in one row. */
const AROUND = SECTIONS * PER_ROW;
/** Shades of a single color used for the arcs; a palette uses its own colors. */
const SHADES = 4;

// Per-section energy follows its target quickly up and slowly down; a real
// spectrum is followed faster than the simulated one, to stay on the beat.
const ENERGY_ATTACK = 0.45;
const ENERGY_RELEASE = 0.06;
const SPECTRUM_ATTACK = 0.7;
const SPECTRUM_RELEASE = 0.18;

function createAurora(ctx: CanvasRenderingContext2D): Scene {
  let time = 0;
  let spin = 0;
  const envelope = createLevelEnvelope();

  /**
   * Energy per section, 0..1. With a spectrum, each section follows one
   * frequency band: bass at the bottom of the ring, treble at the top,
   * mirrored left and right. Without one it's simulated from the level — a
   * slowly drifting spread of loudness plus bursts on each hit.
   */
  const energy = new Float32Array(SECTIONS);
  const sectionBand = new Uint8Array(SECTIONS);
  for (let s = 0; s < SECTIONS; s++) {
    const a = ((s + 0.5) / SECTIONS) * Math.PI * 2;
    // Angular distance from the bottom of the ring (canvas y points down,
    // so the bottom is at +90°), 0..1.
    let d = a - Math.PI / 2;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    sectionBand[s] = Math.round((Math.abs(d) / Math.PI) * (SPECTRUM_BANDS - 1));
  }
  const burst = new Float32Array(SECTIONS);
  let lastHit = 0;

  // Fixed per-dash character: which way and how far it scatters when its
  // section is loud, and how much it tilts off the ring.
  const scatter = new Float32Array(TOTAL);
  const tilt = new Float32Array(TOTAL);
  for (let i = 0; i < TOTAL; i++) {
    const r = Math.random() * 2 - 1;
    // Mostly small offsets, the occasional long throw — the spikes.
    scatter[i] = r * r * r * 2 + r * 0.45;
    tilt[i] = (Math.random() * 2 - 1) * 0.45;
  }

  // Color arcs: a smooth wave around the ring picks each section's shade.
  // Where each section sits on the color wave, 0..1; mapped to however many
  // colors there are when drawing.
  const sectionWave = new Float32Array(SECTIONS);
  const colorPhase = Math.random() * Math.PI * 2;
  for (let s = 0; s < SECTIONS; s++) {
    const a = (s / SECTIONS) * Math.PI * 2;
    const wave = 0.5 + 0.5 * Math.sin(2 * a + colorPhase) * 0.7 + 0.5 * Math.sin(5 * a) * 0.3;
    sectionWave[s] = Math.min(0.999, Math.max(0, wave));
  }
  const noisePhase = [Math.random() * 6, Math.random() * 6];

  let paletteSource: readonly string[] | null = null;
  let colors: readonly string[] = [];
  const sectionColor = new Uint8Array(SECTIONS);

  return {
    draw({ w, h, dt, motion, level, reactivity, palette, spectrum }) {
      const { smooth, hit } = envelope(level, dt);
      time += 0.008 * motion;
      spin += 0.0015 * motion;

      if (palette !== paletteSource) {
        paletteSource = palette;
        // Color arcs: the user's palette, or shades of the one chosen color.
        colors = palette.length > 1
          ? palette
          : saturationShades(parseRgb(palette[0]), SHADES, 0.35).map((c) => c.join(","));
        // Two arcs per color around the ring, each nudged a little by the
        // color wave so the boundaries aren't perfectly even.
        const arcs = colors.length * 2;
        for (let s = 0; s < SECTIONS; s++) {
          const pos = (s / SECTIONS + (sectionWave[s] - 0.5) * 0.08 + 1) % 1;
          sectionColor[s] = Math.floor(pos * arcs) % colors.length;
        }
      }

      // A fresh hit lands on a random arc and spreads to its neighbours.
      // Edge-triggered on crossing a threshold, so it fires once per kick at
      // any frame rate (a per-frame rise test misses kicks at high rates).
      if (hit > 0.5 && lastHit <= 0.5) {
        const center = Math.floor(Math.random() * SECTIONS);
        for (let d = -4; d <= 4; d++) {
          const s = (center + d + SECTIONS) % SECTIONS;
          burst[s] = Math.max(burst[s], hit * Math.exp(-(d * d) / 6));
        }
      }
      lastHit = hit;

      for (let s = 0; s < SECTIONS; s++) {
        const a = (s / SECTIONS) * Math.PI * 2;
        const drift =
          0.5 +
          0.3 * Math.sin(2 * a + time * 1.7 + noisePhase[0]) +
          0.2 * Math.sin(7 * a - time * 2.9 + noisePhase[1]);
        burst[s] *= Math.pow(0.88, dt);
        let target: number;
        if (spectrum) {
          // Band levels sit on a dB scale; trim the floor so quiet bands rest
          // on the ring and only real content pushes out.
          const v = Math.max(0, (spectrum[sectionBand[s]] - 0.18) / 0.55);
          target = Math.min(1, Math.pow(v, 1.5) * reactivity * 0.9);
        } else {
          target = Math.min(1, (smooth * (0.2 + 0.8 * drift) + burst[s]) * reactivity);
        }
        const rate = spectrum
          ? (target > energy[s] ? SPECTRUM_ATTACK : SPECTRUM_RELEASE)
          : (target > energy[s] ? ENERGY_ATTACK : ENERGY_RELEASE);
        energy[s] += (target - energy[s]) * perFrameAlpha(rate, dt);
      }

      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const minDim = Math.min(w, h);
      // Loudness sets the diameter.
      const radius = minDim * (0.17 + smooth * reactivity * 0.06);
      // Block size; the band is ROWS blocks thick.
      const block = Math.max(1.5, minDim * 0.016);
      // How far a loud section's blocks scatter off the ring.
      const reach = minDim * 0.055;
      const alpha = Math.min(1, 0.65 + smooth * reactivity * 0.1);

      ctx.lineWidth = block;
      ctx.lineCap = "butt";
      ctx.globalAlpha = alpha;

      for (let c = 0; c < colors.length; c++) {
        ctx.strokeStyle = `rgb(${colors[c]})`;
        ctx.beginPath();
        for (let s = 0; s < SECTIONS; s++) {
          if (sectionColor[s] !== c) continue;
          const e = energy[s];
          for (let k = 0; k < DASHES; k++) {
            const i = s * DASHES + k;
            const row = k % ROWS;
            const slot = s * PER_ROW + Math.floor(k / ROWS);
            const a = ((slot + 0.5) / AROUND) * Math.PI * 2 + spin;
            const rowRadius = radius + (row - (ROWS - 1) / 2) * block;
            // Loud sections stretch out, quiet ones squash in, and the blocks
            // scatter on top of that.
            const r = rowRadius + (e - 0.25) * reach * 0.9 + scatter[i] * e * reach;
            const px = cx + Math.cos(a) * r;
            const py = cy + Math.sin(a) * r;
            // Each block spans its slice of its row (overlapping a touch so
            // the quiet ring is seamless), tipped off true as it gets louder.
            const half = ((Math.PI * rowRadius) / AROUND) * 1.08;
            const t = a + Math.PI / 2 + tilt[i] * e;
            const tx = Math.cos(t) * half;
            const ty = Math.sin(t) * half;
            ctx.moveTo(px - tx, py - ty);
            ctx.lineTo(px + tx, py + ty);
          }
        }
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
    },
  };
}

export default function AuroraVisualizer(props: VisualizerProps) {
  return <VisualizerCanvas {...props} createScene={createAurora} />;
}

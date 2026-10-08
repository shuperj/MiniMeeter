import VisualizerCanvas, { type Scene, type VisualizerProps } from "./VisualizerCanvas";
import { createBandGroups } from "../../lib/spectrumBands";
import { bucketOf, frameChance, perFrameAlpha } from "../../lib/frameLoop";
import { parseRgb, saturationShades } from "../../lib/color";

/** One mirror tile on the ball, and the light spot it throws onto the wall. */
interface Tile {
  /** Longitude, radians; the tile faces the viewer at 0. */
  theta: number;
  /** Latitude, radians. */
  phi: number;
  /** How well this tile reflects, 0.5..1 — real balls are never uniform. */
  shine: number;
  /** Picks the tile's color (modulo the number of colors). */
  shade: number;
  twinklePhase: number;
  /** Set on a hit, decays; makes the spot flare. */
  sparkle: number;
}

/** Latitude rows of tiles, pole to pole (the very poles are left bare). */
const ROWS = 18;
const MAX_LATITUDE = (80 * Math.PI) / 180;
/** Tiles around the equator; rows nearer the poles get proportionally fewer. */
const EQUATOR_TILES = 36;
/**
 * The spin axis leans toward the viewer a little, so spots travel across the
 * wall in arcs rather than dead-straight lines.
 */
const TILT = 0.28;
const TILT_COS = Math.cos(TILT);
const TILT_SIN = Math.sin(TILT);
/**
 * Rays leaving at a shallower angle to the wall than this land too far away
 * (and too faint) to draw.
 */
const MIN_DEPTH = 0.18;
/** Accent at full saturation down to nearly grey. */
const SHADES = 4;
/** Spots are batched into this many brightness bands per shade. */
const BANDS = 6;
/** Marks a tile facing away, which throws no spot. */
const HIDDEN = 255;

function createDiscoBall(ctx: CanvasRenderingContext2D): Scene {
  let time = 0;
  const bands = createBandGroups(1);
  // Recent treble average: a jump above it (a hi-hat, a cymbal) sparkles.
  let trebleAverage = 0;

  // Tiles laid out like a real mirror ball: rows of latitude, each with tiles
  // spaced evenly around it, plus a little misalignment so the pattern on the
  // wall isn't a perfect grid.
  const tiles: Tile[] = [];
  for (let row = 0; row < ROWS; row++) {
    const phi = -MAX_LATITUDE + (row / (ROWS - 1)) * MAX_LATITUDE * 2;
    const count = Math.max(4, Math.round(EQUATOR_TILES * Math.cos(phi)));
    for (let c = 0; c < count; c++) {
      tiles.push({
        theta: (c / count) * Math.PI * 2 + (row % 2) * (Math.PI / count) + (Math.random() - 0.5) * 0.06,
        phi: phi + (Math.random() - 0.5) * 0.05,
        shine: 0.5 + Math.random() * 0.5,
        shade: Math.floor(Math.random() * 60),
        twinklePhase: Math.random() * Math.PI * 2,
        sparkle: 0,
      });
    }
  }
  const n = tiles.length;

  // Per-frame spot geometry: center, the outward direction from the ball,
  // and half-extents along and across that direction.
  const sx = new Float32Array(n);
  const sy = new Float32Array(n);
  const ux = new Float32Array(n);
  const uy = new Float32Array(n);
  const along = new Float32Array(n);
  const across = new Float32Array(n);
  const band = new Uint8Array(n);

  let paletteSource: readonly string[] | null = null;
  let colors: readonly string[] = [];

  return {
    draw({ w, h, dt, motion, level, reactivity, palette, spectrum }) {
      const { groups, bass, treble } = bands(spectrum, level, dt);
      const smooth = groups[0];
      const trebleJump = Math.max(0, treble - trebleAverage - 0.05);
      trebleAverage += (treble - trebleAverage) * perFrameAlpha(0.08, dt);
      const spin = 0.0055 * motion + smooth * reactivity * 0.004 * dt;
      time += spin;

      if (palette !== paletteSource) {
        paletteSource = palette;
        // Tiles reflect the user's palette, or shades of the one chosen color.
        colors = palette.length > 1
          ? palette
          : saturationShades(parseRgb(palette[0]), SHADES, 0.12).map((c) => c.join(","));
      }

      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      // Wall distance in pixels: how far a ray at 45° lands from the center.
      const throwDist = Math.hypot(w, h) * 0.22;
      const size = Math.min(w, h) * 0.02 * (1 + bass * reactivity * 0.35);
      // A hit makes a random handful of tiles flare.
      const sparkleChance = Math.min(0.5, trebleJump * reactivity * 1.5);

      for (let i = 0; i < n; i++) {
        const t = tiles[i];
        t.theta += spin;
        t.sparkle *= Math.pow(0.8, dt);
        if (sparkleChance > 0 && Math.random() < frameChance(sparkleChance, dt)) t.sparkle = 1;

        // Direction of the tile's reflected ray, then the lean of the axis.
        const cosPhi = Math.cos(t.phi);
        const rx = Math.sin(t.theta) * cosPhi;
        const ry0 = Math.sin(t.phi);
        const rz0 = Math.cos(t.theta) * cosPhi;
        const ry = ry0 * TILT_COS - rz0 * TILT_SIN;
        const rz = ry0 * TILT_SIN + rz0 * TILT_COS;

        // Only rays heading toward the wall in front of us land on it.
        if (rz <= MIN_DEPTH) {
          band[i] = HIDDEN;
          continue;
        }

        // Where the ray hits a flat wall: straight-on rays land near the
        // center, oblique ones fly out fast — the classic outward rush.
        const wx = rx / rz;
        const wy = ry / rz;
        const x = cx + wx * throwDist;
        const y = cy + wy * throwDist;
        const reach = 1 / rz;
        const half = size * 0.5 * Math.sqrt(reach) * (1 + t.sparkle * 0.6);
        if (x < -half * 4 || x > w + half * 4 || y < -half * 4 || y > h + half * 4) {
          band[i] = HIDDEN;
          continue;
        }

        const dist = Math.hypot(wx, wy);
        sx[i] = x;
        sy[i] = y;
        ux[i] = dist > 1e-4 ? wx / dist : 1;
        uy[i] = dist > 1e-4 ? wy / dist : 0;
        // Farther out, spots grow and smear along the line from the ball, as
        // the light hits the wall at an ever shallower angle.
        across[i] = half;
        along[i] = half * Math.pow(reach, 0.6);

        // ...and fade, spread over more wall.
        const twinkle = 0.85 + 0.15 * Math.sin(time * 40 + t.twinklePhase);
        const brightness = Math.pow(rz, 1.3) * t.shine * twinkle + t.sparkle * 0.5;
        band[i] = bucketOf(Math.min(1, brightness), BANDS);
      }

      const peak = Math.min(1, 0.65 + smooth * reactivity * 0.15);
      for (let s = 0; s < colors.length; s++) {
        ctx.fillStyle = `rgb(${colors[s]})`;
        for (let b = 0; b < BANDS; b++) {
          const brightness = (b + 0.5) / BANDS;

          // A faint glow around each spot, then the crisp spot itself. Spots
          // are squares turned to face away from the ball, so they're drawn
          // as quads rather than axis-aligned rects.
          for (const [scale, alphaScale] of [[1.9, 0.14], [1, 1]] as const) {
            ctx.beginPath();
            let any = false;
            for (let i = 0; i < n; i++) {
              if (band[i] !== b || tiles[i].shade % colors.length !== s) continue;
              const ax = ux[i] * along[i] * scale;
              const ay = uy[i] * along[i] * scale;
              const bx = -uy[i] * across[i] * scale;
              const by = ux[i] * across[i] * scale;
              ctx.moveTo(sx[i] + ax + bx, sy[i] + ay + by);
              ctx.lineTo(sx[i] + ax - bx, sy[i] + ay - by);
              ctx.lineTo(sx[i] - ax - bx, sy[i] - ay - by);
              ctx.lineTo(sx[i] - ax + bx, sy[i] - ay + by);
              ctx.closePath();
              any = true;
            }
            if (!any) break;
            ctx.globalAlpha = Math.min(1, peak * brightness * alphaScale);
            ctx.fill();
          }
        }
      }

      ctx.globalAlpha = 1;
    },
  };
}

export default function DiscoBallVisualizer(props: VisualizerProps) {
  return <VisualizerCanvas {...props} createScene={createDiscoBall} />;
}

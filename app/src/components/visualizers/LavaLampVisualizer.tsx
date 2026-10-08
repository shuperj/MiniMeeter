import VisualizerCanvas, { type Scene, type VisualizerProps } from "./VisualizerCanvas";
import { createBandGroups } from "../../lib/spectrumBands";
import { sampleMetaballs, type Metaball, type MetaballSample } from "../../lib/metaballs";
import { hueRotate, parseRgb, type Rgb } from "../../lib/color";
import { createBlob, stepLava, type LavaBlob } from "../../lib/lavaSim";
import { createLavaGl } from "./lavaGl";

/** Rising speed (per 60 Hz frame) at which a blob's trailing tail is fully drawn out. */
const TAIL_SPEED = 0.004;

/** Blobs in the lamp; a bigger window gets bigger blobs, like a bigger lamp. */
const BLOB_COUNT = 7;
const MAX_BALLS = BLOB_COUNT * 2;
/** Without WebGL the CPU shades every pixel, so it renders at this fraction. */
const CPU_SCALE = 1 / 3;

/** Melted wax sitting at the bottom: its surface, as a fraction of height. */
const POOL_SURFACE = 0.91;
/** How soft the pool's field is, as a fraction of height. */
const POOL_DEPTH = 0.1;

/** Steepness of the height profile h = 1 - exp(-K (f - 1)) (see lavaGl). */
const HEIGHT_K = 1;
/** The edge fades over about 1 / EDGE_SHARPNESS pixels. */
const EDGE_SHARPNESS = 0.3;
/** Pixels with less field than this are well outside every blob. */
const CULL = 0.6;
/**
 * Main blobs' center softening, as a fraction of R² (see lib/metaballs). A
 * broad core makes each blob a smooth hill rather than a spike, so where blobs
 * overlap they add up to one smooth mass, with no ring or lump per blob.
 */
const BLOB_SOFTNESS = 0.3;
/** R that keeps the surface (field = 1) at the intended radius r despite the softening. */
const SOFT_RADIUS_SCALE = 1 / Math.sqrt(1 - BLOB_SOFTNESS);

// Light from the upper left, viewer straight on; HALF is the Blinn-Phong
// half-vector between them, for the specular hotspot.
const LIGHT = normalize3(-0.45, -0.65, 0.6);
const LIGHT_X = LIGHT[0];
const LIGHT_Y = LIGHT[1];
const LIGHT_Z = LIGHT[2];
const HALF = normalize3(LIGHT_X, LIGHT_Y, LIGHT_Z + 1);
const HALF_X = HALF[0];
const HALF_Y = HALF[1];
const HALF_Z = HALF[2];

function normalize3(x: number, y: number, z: number): [number, number, number] {
  const len = Math.sqrt(x * x + y * y + z * z);
  return [x / len, y / len, z / len];
}

function createLavaLamp(ctx: CanvasRenderingContext2D): Scene {
  const bands = createBandGroups(1);

  const blobs: LavaBlob[] = [];
  // Two metaballs per blob: the blob itself, then (at index n + i) the tail
  // it draws out behind it while rising — the classic teardrop.
  const balls: Metaball[] = [];
  const sample: MetaballSample = { f: 0, gx: 0, gy: 0 };

  const spawnBlob = (): LavaBlob =>
    createBlob({
      x: 0.15 + Math.random() * 0.7,
      y: 0.3 + Math.random() * 0.68,
      temp: 0.3 + Math.random() * 0.5,
      // Mostly mid-sized, a few droplets and the odd big glob.
      size: 0.6 + Math.random() * 0.5 + (Math.random() < 0.2 ? 0.4 : 0),
    });

  for (let i = 0; i < BLOB_COUNT; i++) blobs.push(spawnBlob());
  for (let i = 0; i < MAX_BALLS; i++) balls.push({ x: 0, y: 0, r: 0, sx: 1, sy: 1 });

  // Shade on the GPU when possible (full resolution, next to no CPU); else
  // fall back to shading pixels in JS at reduced resolution.
  const gl = createLavaGl(MAX_BALLS);
  // Render-space size: the canvas for WebGL, a reduced buffer for the CPU.
  let rw = 0;
  let rh = 0;
  let image: ImageData | null = null;
  let cpuCanvas: HTMLCanvasElement | null = null;
  let cpuCtx: CanvasRenderingContext2D | null = null;
  let paletteSource: readonly string[] | null = null;
  let base: Rgb = [0, 0, 0];
  let hot: Rgb = [0, 0, 0];
  // With a palette, each blob has its own color and the pool takes the first;
  // colors blend by each blob's share of the field where they merge.
  let blobColors: Rgb[] = [];
  /** Color per metaball (a tail shares its blob's), for the GPU path. */
  let ballColors: Rgb[] = [];
  const contrib = new Float32Array(MAX_BALLS);
  let kicked = false;

  return {
    resize(w, h) {
      if (gl) {
        rw = w;
        rh = h;
        if (w > 0 && h > 0) gl.resize(w, h);
        return;
      }
      rw = Math.max(1, Math.ceil(w * CPU_SCALE));
      rh = Math.max(1, Math.ceil(h * CPU_SCALE));
      // createImageData throws on a zero-sized canvas (e.g. while hidden).
      image = w > 0 && h > 0 ? ctx.createImageData(rw, rh) : null;
      cpuCanvas = document.createElement("canvas");
      cpuCanvas.width = rw;
      cpuCanvas.height = rh;
      cpuCtx = cpuCanvas.getContext("2d");
    },

    draw({ w, h, dt, motion, level, reactivity, palette, spectrum }) {
      if (!gl && (!image || !cpuCtx || !cpuCanvas)) return;
      // The bass is the heat source: kicks warm the wax and send it up. The
      // simulation itself runs on `motion`, so Speed slows or hurries the lamp.
      const { groups, bass, onset } = bands(spectrum, level, dt);
      const smooth = groups[0];

      if (palette !== paletteSource) {
        paletteSource = palette;
        base = parseRgb(palette[0]);
        // The rim glows in a lighter, slightly shifted hue, like hot wax.
        hot = hueRotate(base, 20).map((c) => Math.round(c + (255 - c) * 0.45)) as Rgb;
        blobColors = palette.length > 1
          ? Array.from({ length: BLOB_COUNT }, (_, i) => parseRgb(palette[i % palette.length]))
          : [];
        ballColors = blobColors.length ? [...blobColors, ...blobColors] : [];
      }
      const multi = blobColors.length > 0;

      // Typical blob radius: blobs share the canvas area, so they keep their
      // proportions whatever the window's shape.
      const unit = Math.sqrt((rw * rh) / blobs.length) * 0.21;
      // Louder bass turns the bulb up, so the lamp gets busier; a kick gives
      // the wax sitting in the pool a pulse of heat (once per kick).
      const bulb = 1 + bass * reactivity * 0.4;
      const kick = onset * reactivity > 0.6;
      if (kick && !kicked) {
        for (const b of blobs) if (b.y > 0.88) b.temp = Math.min(1, b.temp + 0.08 * reactivity);
      }
      kicked = kick;

      // Physics (lib/lavaSim) runs on `motion`, so Speed slows or hurries it.
      stepLava(blobs, motion, bulb);

      const n = blobs.length;
      for (let i = 0; i < n; i++) {
        const b = blobs[i];
        const r = b.size * unit;
        const rising = Math.min(1, Math.max(0, -b.vy / TAIL_SPEED));
        const sinking = Math.min(1, Math.max(0, b.vy / TAIL_SPEED));

        // Rising wax is a little taller than wide; sinking wax flattens.
        const sy = 1 + rising * 0.15 - sinking * 0.12;
        const ball = balls[i];
        ball.x = b.x * rw;
        ball.y = b.y * rh;
        ball.r = r * SOFT_RADIUS_SCALE;
        ball.soft = BLOB_SOFTNESS * ball.r * ball.r;
        ball.sy = sy;
        ball.sx = 1 / Math.sqrt(sy);

        // The tail: a smaller ball trailing below a rising blob, which merges
        // with it into a teardrop and, near the pool, into a neck of wax.
        // It sits close enough to fuse with the blob, so it reads as one
        // tapered shape rather than a separate droplet.
        const tail = balls[n + i];
        tail.x = ball.x;
        tail.y = ball.y + r * (0.7 + rising * 0.5);
        tail.r = r * 0.9 * rising;
        // Softened on the parent's scale: the tail only ever stretches the
        // blob's underside into a taper, never a spike or a crease inside it.
        tail.soft = r * r;
        tail.sx = 0.65;
        tail.sy = 1.5;
      }

      const poolLine = (POOL_SURFACE + POOL_DEPTH) * rh;
      const poolR2 = (POOL_DEPTH * rh) ** 2;

      const maxAlpha = Math.min(1, 0.65 + smooth * reactivity * 0.12) * 255;
      // How steeply the surface curves away from the viewer at the rim; scaled
      // to blob size so every blob reads as rounded at any window size.
      const bump = unit * 1.1;

      ctx.clearRect(0, 0, w, h);
      if (gl) {
        gl.render({ balls, colors: ballColors, multi, base, hot, poolLine, poolR2, bump, maxAlpha: maxAlpha / 255 });
        ctx.drawImage(gl.canvas, 0, 0);
        return;
      }

      // CPU fallback: shade a reduced buffer, then scale it up smoothly.
      const data = image!.data;
      let p = 0;
      for (let y = 0; y < rh; y++) {
        const py = y + 0.5;
        for (let x = 0; x < rw; x++) {

          sampleMetaballs(x + 0.5, py, balls, sample, multi ? contrib : undefined);
          // The pool: a field that falls off with distance above a line just
          // below the canvas. Blobs merge into it and neck away from it.
          const above = Math.min(-0.5, py - poolLine);
          const pool = poolR2 / (above * above);
          const f = sample.f + pool;
          const gx = sample.gx;
          const gy = sample.gy - (2 * pool) / above;

          if (f <= CULL) {
            data[p + 3] = 0;
            p += 4;
            continue;
          }

          // Shade as a height map h = 1 - exp(-K (f - 1)): steep at the rim,
          // level inside, so merged blobs read as one mass. Slope = h'(f) grad f.
          const inv = bump * HEIGHT_K * Math.exp(-HEIGHT_K * Math.max(f - 1, 0));
          let nx = -gx * inv;
          let ny = -gy * inv;
          let nz = 1;
          const len = Math.sqrt(nx * nx + ny * ny + 1);
          nx /= len;
          ny /= len;
          nz /= len;

          const diffuse = Math.max(0, nx * LIGHT_X + ny * LIGHT_Y + nz * LIGHT_Z);
          let spec = Math.max(0, nx * HALF_X + ny * HALF_Y + nz * HALF_Z);
          spec *= spec; spec *= spec; spec *= spec; spec *= spec; spec *= spec; // ^32
          // Light glowing through the wax at the rim, like a backlit lamp.
          const rim = (1 - nz) * (1 - nz);

          const lit = 0.3 + diffuse * 0.7;
          // Crisp edge: (f - 1) / |grad f| ≈ distance to the surface in pixels.
          const edge = Math.min(1, Math.max(0, ((f - 1) / Math.max(Math.hypot(gx, gy), 1e-5)) * EDGE_SHARPNESS + 0.5));
          let br = base[0];
          let bg = base[1];
          let bb = base[2];
          let hr = hot[0];
          let hg = hot[1];
          let hb = hot[2];
          if (multi) {
            // Weighted mix of the blob colors (pool counts as the first).
            br = base[0] * pool;
            bg = base[1] * pool;
            bb = base[2] * pool;
            for (let i = 0; i < balls.length; i++) {
              const c = blobColors[i < n ? i : i - n];
              br += c[0] * contrib[i];
              bg += c[1] * contrib[i];
              bb += c[2] * contrib[i];
            }
            br /= f;
            bg /= f;
            bb /= f;
            hr = br + (255 - br) * 0.45;
            hg = bg + (255 - bg) * 0.45;
            hb = bb + (255 - bb) * 0.45;
          }
          data[p] = br * lit + hr * rim * 0.6 + 255 * spec * 0.9;
          data[p + 1] = bg * lit + hg * rim * 0.6 + 255 * spec * 0.9;
          data[p + 2] = bb * lit + hb * rim * 0.6 + 255 * spec * 0.9;
          data[p + 3] = Math.min(255, edge * (maxAlpha + spec * 160));
          p += 4;
        }
      }
      cpuCtx!.putImageData(image!, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(cpuCanvas!, 0, 0, w, h);
    },
  };
}

export default function LavaLampVisualizer(props: VisualizerProps) {
  // Full resolution: the shading runs on the GPU (see lavaGl).
  return <VisualizerCanvas {...props} createScene={createLavaLamp} />;
}

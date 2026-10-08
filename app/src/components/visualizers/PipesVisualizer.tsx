import VisualizerCanvas, { type Scene, type VisualizerProps } from "./VisualizerCanvas";
import { colorVariants, parseRgb, type Rgb } from "../../lib/color";
import { capsuleNormal, intersectCapsule } from "../../lib/raytrace";
import { createBandGroups } from "../../lib/spectrumBands";

/**
 * After the Windows "3D Pipes" screensaver: pipes grow cell by cell through a
 * 3D grid, turn at random, never cross each other, and get a ball joint at
 * every turn. When the space fills up, the picture dissolves and starts over.
 *
 * Drawn with a tiny software renderer: every bit of pipe is a shaded capsule
 * rasterized straight into a low-res pixel buffer with a depth buffer, so
 * pipes pass correctly in front of and behind each other. Only the newly
 * grown piece of pipe is drawn each frame.
 */

type Vec3 = [number, number, number];

interface Pipe {
  /** Grid cell the pipe is growing out of. */
  cell: Vec3;
  /** Direction of growth: one of DIRS. */
  dir: number;
  /** 0..1 progress toward the next cell. */
  progress: number;
  /** Cells grown so far. */
  length: number;
  color: Rgb;
}

const DIRS: Vec3[] = [
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
];

/** Cells across the window's shorter side; the longer side gets proportionally more. */
const CELLS_SHORT = 10;
const CELLS_DEEP = 10;
/** Pipe and ball-joint radius, in cells. */
const PIPE_R = 0.22;
const JOINT_R = 0.3;
/** Chance of turning at each cell even when the way ahead is clear. */
const TURN_CHANCE = 0.22;
/** Start over once this share of the grid is filled. */
const FILL_LIMIT = 0.32;
/** Frames (at 60 Hz) the dissolve takes. */
const DISSOLVE_FRAMES = 50;
const MAX_PIPES = 4;
/** A pipe ends after this many cells so new colors keep arriving. */
const MAX_LENGTH = 36;

// Light from the upper left and slightly in front; HALF is the half-vector
// toward a viewer looking down +z, for the specular glint.
const L = norm([-0.45, -0.6, -0.65]);
const H = norm([L[0], L[1], L[2] - 1]);

function norm(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / len, v[1] / len, v[2] / len];
}

function createPipes(ctx: CanvasRenderingContext2D): Scene {
  const bands = createBandGroups(1);

  let image: ImageData | null = null;
  let depth = new Float32Array(0);
  let w = 0;
  let h = 0;

  // Grid and camera, rebuilt on resize.
  let gx = 0;
  let gy = 0;
  const gz = CELLS_DEEP;
  let occupied = new Uint8Array(0);
  let filled = 0;
  let focal = 0;
  let camDist = 0;

  let pipes: Pipe[] = [];
  let kicked = false;
  let dissolving = 0;

  let paletteSource: readonly string[] | null = null;
  let palette: Rgb[] = [];

  const cellIndex = (c: Vec3) => (c[2] * gy + c[1]) * gx + c[0];
  const inGrid = (c: Vec3) =>
    c[0] >= 0 && c[0] < gx && c[1] >= 0 && c[1] < gy && c[2] >= 0 && c[2] < gz;
  const isFree = (c: Vec3) => inGrid(c) && !occupied[cellIndex(c)];
  const occupy = (c: Vec3) => {
    occupied[cellIndex(c)] = 1;
    filled++;
  };

  /** Grid cell (or a point between cells) to camera space. */
  const toCamera = (x: number, y: number, z: number): Vec3 => [
    x - (gx - 1) / 2,
    y - (gy - 1) / 2,
    z - (gz - 1) / 2 + camDist,
  ];

  // Only the region drawn into since the last frame is uploaded to the
  // canvas, so full resolution costs little: a growing pipe touches a few
  // hundred pixels a frame, not the whole window.
  let dirtyX0 = Infinity;
  let dirtyY0 = Infinity;
  let dirtyX1 = -1;
  let dirtyY1 = -1;
  let fullDirty = true;
  const markDirty = (x0: number, y0: number, x1: number, y1: number) => {
    if (x0 < dirtyX0) dirtyX0 = x0;
    if (y0 < dirtyY0) dirtyY0 = y0;
    if (x1 > dirtyX1) dirtyX1 = x1;
    if (y1 > dirtyY1) dirtyY1 = y1;
  };
  const flush = () => {
    if (!image) return;
    if (fullDirty) {
      ctx.putImageData(image, 0, 0);
    } else if (dirtyX1 >= dirtyX0) {
      ctx.putImageData(image, 0, 0, dirtyX0, dirtyY0, dirtyX1 - dirtyX0 + 1, dirtyY1 - dirtyY0 + 1);
    }
    fullDirty = false;
    dirtyX0 = dirtyY0 = Infinity;
    dirtyX1 = dirtyY1 = -1;
  };

  const reset = () => {
    occupied = new Uint8Array(gx * gy * gz);
    filled = 0;
    pipes = [];
    depth.fill(Infinity);
    if (image) image.data.fill(0);
    fullDirty = true;
  };

  // Colors go round in order, so every palette color shows up.
  let nextColor = Math.floor(Math.random() * 5);
  const pickColor = (): Rgb => palette[nextColor++ % palette.length];

  /**
   * Ray-trace a capsule (a cylinder with rounded ends) between two camera-
   * space points into the pixel buffer, with depth test and per-pixel shading.
   * Tracing the true 3D shape keeps a pipe pointing at the viewer smooth: the
   * pieces it grows in each frame join seamlessly instead of each reading as
   * its own sphere. A zero-length capsule is a sphere: the ball joints.
   */
  const drawCapsule = (a: Vec3, b: Vec3, radius: number, color: Rgb) => {
    if (!image) return;
    const ax = w / 2 + (focal * a[0]) / a[2];
    const ay = h / 2 + (focal * a[1]) / a[2];
    const ar = (focal * radius) / a[2] + 1;
    const bx = w / 2 + (focal * b[0]) / b[2];
    const by = h / 2 + (focal * b[1]) / b[2];
    const br = (focal * radius) / b[2] + 1;

    const x0 = Math.max(0, Math.floor(Math.min(ax - ar, bx - br)));
    const x1 = Math.min(w - 1, Math.ceil(Math.max(ax + ar, bx + br)));
    const y0 = Math.max(0, Math.floor(Math.min(ay - ar, by - br)));
    const y1 = Math.min(h - 1, Math.ceil(Math.max(ay + ar, by + br)));
    if (x1 < x0 || y1 < y0) return;
    markDirty(x0, y0, x1, y1);
    const data = image.data;
    const rd: Vec3 = [0, 0, 0];
    const hit: Vec3 = [0, 0, 0];

    for (let y = y0; y <= y1; y++) {
      const dy = (y + 0.5 - h / 2) / focal;
      for (let x = x0; x <= x1; x++) {
        const dx = (x + 0.5 - w / 2) / focal;
        const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
        rd[0] = dx * inv;
        rd[1] = dy * inv;
        rd[2] = inv;
        const t = intersectCapsule(rd, a, b, radius);
        if (t <= 0) continue;
        const i = y * w + x;
        if (t >= depth[i]) continue;
        depth[i] = t;

        hit[0] = rd[0] * t;
        hit[1] = rd[1] * t;
        hit[2] = rd[2] * t;
        const n = capsuleNormal(hit, a, b, radius);
        const diffuse = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
        let spec = Math.max(0, n[0] * H[0] + n[1] * H[1] + n[2] * H[2]);
        spec *= spec; spec *= spec; spec *= spec; spec *= spec; // ^16
        const lit = 0.22 + diffuse * 0.78;
        const p = i * 4;
        data[p] = color[0] * lit + 255 * spec * 0.75;
        data[p + 1] = color[1] * lit + 255 * spec * 0.75;
        data[p + 2] = color[2] * lit + 255 * spec * 0.75;
        data[p + 3] = 255;
      }
    }
  };

  /** Choose where to go from `cell`; -1 if boxed in. */
  const chooseDir = (cell: Vec3, current: number): number => {
    const ahead: Vec3 = [
      cell[0] + DIRS[current][0],
      cell[1] + DIRS[current][1],
      cell[2] + DIRS[current][2],
    ];
    if (isFree(ahead) && Math.random() >= TURN_CHANCE) return current;
    const options: number[] = [];
    for (let d = 0; d < 6; d++) {
      // Never double back on itself.
      if ((d ^ 1) === current || d === current) continue;
      const next: Vec3 = [cell[0] + DIRS[d][0], cell[1] + DIRS[d][1], cell[2] + DIRS[d][2]];
      if (isFree(next)) options.push(d);
    }
    if (options.length > 0) return options[Math.floor(Math.random() * options.length)];
    return isFree(ahead) ? current : -1;
  };

  /** Start a pipe in a random free cell, or report that the grid is full. */
  const spawnPipe = (): boolean => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const cell: Vec3 = [
        Math.floor(Math.random() * gx),
        Math.floor(Math.random() * gy),
        Math.floor(Math.random() * gz),
      ];
      if (!isFree(cell)) continue;
      const dir = chooseDir(cell, Math.floor(Math.random() * 6));
      if (dir < 0) continue;
      occupy(cell);
      occupy([cell[0] + DIRS[dir][0], cell[1] + DIRS[dir][1], cell[2] + DIRS[dir][2]]);
      const color = pickColor();
      const c = toCamera(cell[0], cell[1], cell[2]);
      drawCapsule(c, c, JOINT_R, color);
      pipes.push({ cell, dir, progress: 0, length: 0, color });
      return true;
    }
    return false;
  };

  return {
    resize(width, height) {
      w = width;
      h = height;
      image = w > 0 && h > 0 ? ctx.createImageData(w, h) : null;
      depth = new Float32Array(w * h);
      const ratio = w / Math.max(1, h);
      gx = Math.max(4, Math.round(CELLS_SHORT * Math.max(1, ratio)));
      gy = Math.max(4, Math.round(CELLS_SHORT * Math.max(1, 1 / ratio)));
      // Far enough back for a gentle perspective; the nearest layer of the
      // grid just fits the window, deeper layers sit smaller inside it.
      camDist = gz * 1.4;
      const nearest = camDist - (gz - 1) / 2;
      focal = Math.min(w / gx, h / gy) * nearest * 0.95;
      reset();
    },

    draw({ dt, motion, level, reactivity, palette: colors, spectrum }) {
      if (!image) return;
      // Overall energy grows the pipes faster; a bass kick sprouts a new one.
      const { groups, onset } = bands(spectrum, level, dt);
      const energy = groups[0];

      if (colors !== paletteSource) {
        paletteSource = colors;
        // Every pipe gets its own color, as in the original: the user's
        // palette, or shades of the one chosen color.
        palette = colorVariants(colors.map(parseRgb), 5);
      }

      if (dissolving > 0) {
        // The original's dissolve: pixels drop out at random until it's clear.
        const data = image.data;
        const chance = 1 / Math.max(1, dissolving);
        for (let p = 3; p < data.length; p += 4) {
          if (data[p] && Math.random() < chance * dt) data[p] = 0;
        }
        dissolving -= dt;
        if (dissolving <= 0) reset();
        fullDirty = true;
        flush();
        return;
      }

      if (pipes.length === 0) spawnPipe();
      // Edge-triggered: one kick, one chance at a new pipe, at any frame rate.
      const kick = onset * reactivity > 0.4;
      if (kick && !kicked && pipes.length < MAX_PIPES && Math.random() < 0.5) spawnPipe();
      kicked = kick;

      // Cells grown per 60 Hz frame; louder music grows faster.
      const speed = 0.09 * motion + energy * reactivity * 0.2 * dt;

      for (let pi = pipes.length - 1; pi >= 0; pi--) {
        const pipe = pipes[pi];
        let remaining = speed;
        while (remaining > 0) {
          const step = Math.min(remaining, 1 - pipe.progress);
          const d = DIRS[pipe.dir];
          const from = pipe.progress;
          const to = from + step;
          const c = pipe.cell;
          drawCapsule(
            toCamera(c[0] + d[0] * from, c[1] + d[1] * from, c[2] + d[2] * from),
            toCamera(c[0] + d[0] * to, c[1] + d[1] * to, c[2] + d[2] * to),
            PIPE_R,
            pipe.color,
          );
          pipe.progress = to;
          remaining -= step;
          if (pipe.progress < 1) break;

          // Arrived at the next cell: claim it, then pick the way on.
          pipe.cell = [c[0] + d[0], c[1] + d[1], c[2] + d[2]];
          pipe.progress = 0;
          pipe.length++;
          const next = pipe.length >= MAX_LENGTH ? -1 : chooseDir(pipe.cell, pipe.dir);
          const here = toCamera(pipe.cell[0], pipe.cell[1], pipe.cell[2]);
          if (next < 0) {
            // Boxed in (or long enough): cap it off and let another pipe take over.
            drawCapsule(here, here, JOINT_R, pipe.color);
            pipes.splice(pi, 1);
            break;
          }
          if (next !== pipe.dir) drawCapsule(here, here, JOINT_R, pipe.color);
          pipe.dir = next;
          // Reserve the cell it's heading into so pipes never collide.
          occupy([pipe.cell[0] + DIRS[next][0], pipe.cell[1] + DIRS[next][1], pipe.cell[2] + DIRS[next][2]]);
        }
      }

      if (filled >= gx * gy * gz * FILL_LIMIT) dissolving = DISSOLVE_FRAMES;
      flush();
    },
  };
}

export default function PipesVisualizer(props: VisualizerProps) {
  // Full resolution; only new growth is traced and uploaded each frame. The
  // Pixelate filter brings back the chunky software-rendered look.
  return <VisualizerCanvas {...props} createScene={createPipes} />;
}

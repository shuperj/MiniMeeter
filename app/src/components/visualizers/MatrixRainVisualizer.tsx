import VisualizerCanvas, { type Scene, type VisualizerProps } from "./VisualizerCanvas";
import { createBandGroups } from "../../lib/spectrumBands";

/** Spectrum groups across the width: left = bass, right = treble. */
const GROUPS = 16;

interface Column {
  x: number;
  y: number;
  speed: number;
  /** Indices into CHARS. */
  chars: number[];
  /** Picks the column's palette color (modulo the palette size). */
  color: number;
}

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789";

const FONT_SIZE = 12;
const COL_WIDTH = FONT_SIZE * 0.8;

function randomChar() {
  return Math.floor(Math.random() * CHARS.length);
}

function randomChars(length: number): number[] {
  const chars: number[] = [];
  for (let j = 0; j < length; j++) chars.push(randomChar());
  return chars;
}

function createMatrixRain(ctx: CanvasRenderingContext2D): Scene {
  let columns: Column[] = [];
  let lastW = 0;
  const bands = createBandGroups(GROUPS);
  // Onset is edge-triggered, so one kick spawns one column, not one per frame.
  let kicked = false;

  const initColumns = (w: number, h: number) => {
    const numCols = Math.ceil(w / COL_WIDTH);
    columns = [];
    for (let i = 0; i < numCols; i++) {
      if (Math.random() < 0.6) {
        columns.push({
          x: i * COL_WIDTH,
          y: -Math.random() * h,
          speed: 1 + Math.random() * 2,
          chars: randomChars(5 + Math.floor(Math.random() * 15)),
          color: Math.floor(Math.random() * 60),
        });
      }
    }
  };

  return {
    resize(w, h) {
      if (w !== lastW) {
        lastW = w;
        initColumns(w, h);
      }
    },

    draw({ w, h, dt, motion, level, reactivity, palette, spectrum }) {
      const { groups, onset } = bands(spectrum, level, dt);

      // Fade effect
      // Every column draws its own fading tail, so the canvas is cleared each
      // frame rather than smeared: it looks the same at any frame rate.
      ctx.clearRect(0, 0, w, h);

      // One fill color for every glyph; per-glyph fade goes through globalAlpha
      // so no rgba() string is built and parsed per character.
      ctx.font = `${FONT_SIZE}px monospace`;

      for (const col of columns) {
        // Each column follows the band under it, so the rain reads as a
        // spectrum: loud bands fall faster and glow brighter.
        const g = Math.min(GROUPS - 1, Math.max(0, Math.floor((col.x / w) * GROUPS)));
        const e = groups[g] * reactivity;
        col.y += col.speed * (1.2 * motion + e * 3 * dt);
        const mutateChance = (0.03 + e * 0.05) * dt;

        // Occasionally mutate a random char
        if (Math.random() < mutateChance) {
          col.chars[Math.floor(Math.random() * col.chars.length)] = randomChar();
        }

        // One color per column, from the palette.
        ctx.fillStyle = `rgb(${palette[col.color % palette.length]})`;
        const len = col.chars.length;
        for (let j = 0; j < len; j++) {
          const charY = col.y - j * FONT_SIZE;
          if (charY < -FONT_SIZE || charY > h + FONT_SIZE) continue;

          const headDist = j / len;
          let a: number;
          if (j === 0) {
            // Head char — bright accent
            a = Math.min(1, 0.7 + e * 0.3);
          } else if (j < 3) {
            // Near head — lighter
            a = Math.min(1, 0.55 + e * 0.3) * (1 - headDist * 0.3);
          } else {
            // Tail — fade to dim
            a = Math.min(1, 0.4 + e * 0.25) * (1 - headDist) * 0.8;
          }
          if (a < 0.01) continue;

          ctx.globalAlpha = a;
          ctx.fillText(CHARS[col.chars[j]], col.x, charY);
        }

        // Reset when off screen
        if (col.y - len * FONT_SIZE > h) {
          col.y = -Math.random() * h * 0.5;
          col.speed = 1 + Math.random() * 2;
          col.chars = randomChars(5 + Math.floor(Math.random() * 15));
        }
      }

      ctx.globalAlpha = 1;

      // A bass kick spawns an extra column.
      const kick = onset * reactivity > 0.4;
      const spawn = kick && !kicked;
      kicked = kick;
      if (spawn) {
        columns.push({
          x: Math.random() * w,
          y: 0,
          speed: 2 + Math.random() * 2,
          chars: randomChars(5 + Math.floor(Math.random() * 10)),
          color: Math.floor(Math.random() * 60),
        });
        // Cap total columns
        if (columns.length > 80) columns.shift();
      }
    },
  };
}

export default function MatrixRainVisualizer(props: VisualizerProps) {
  return <VisualizerCanvas {...props} createScene={createMatrixRain} />;
}

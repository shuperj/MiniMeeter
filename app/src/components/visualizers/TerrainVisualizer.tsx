import { useMemo, useRef, type RefObject } from "react";
import VisualizerCanvas, { type Scene, type VisualizerProps } from "./VisualizerCanvas";
import { createBandGroups } from "../../lib/spectrumBands";
import { createTerrain, stepTerrain, GROUPS, COLS, ROWS, VISIBLE, newestRow, type TerrainState } from "../../lib/terrainSim";
import { paletteLights, type PaletteLights } from "../../lib/paletteLights";
import type { TerrainMaterial, TerrainPattern } from "../../types/style";
import { createTerrainGl } from "./terrainGl";

export interface TerrainOptions {
  material: TerrainMaterial;
  pattern: TerrainPattern;
}

function createTerrainScene(ctx: CanvasRenderingContext2D, options: RefObject<TerrainOptions>): Scene {
  // One band group per two columns of land.
  const bands = createBandGroups(GROUPS);
  const state = createTerrain();
  // Shape and shade on the GPU when possible; else a flat sketch of the rows.
  const gl = createTerrainGl();
  let paletteSource: readonly string[] | null = null;
  let lights: PaletteLights | null = null;

  return {
    resize(w, h) {
      if (gl && w > 0 && h > 0) gl.resize(w, h);
    },

    draw({ w, h, dt, motion, level, reactivity, palette, spectrum, cel }) {
      const { groups, bass, mid, treble } = bands(spectrum, level, dt);
      if (palette !== paletteSource) {
        paletteSource = palette;
        lights = paletteLights(palette);
      }
      const loudness = Math.min(1, bass * 0.7 + mid * 0.6 + treble * 0.4);
      // Rows are laid down on `motion`, so Speed slows or hurries the flight.
      stepTerrain(state, motion, { groups, bass, level: loudness, reactivity });

      ctx.clearRect(0, 0, w, h);
      const { material, pattern } = options.current!;
      if (gl) {
        gl.render({ state, material, pattern, lights: lights!, cel });
        ctx.drawImage(gl.canvas, 0, 0);
        return;
      }
      drawFlat(ctx, w, h, state, lights!);
    },
  };
}

const rgb = (c: readonly [number, number, number], a = 1) =>
  `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;

/** CPU fallback without WebGL: the rows of land as a shaded strip map, newest at the bottom. */
function drawFlat(ctx: CanvasRenderingContext2D, w: number, h: number, state: TerrainState, lights: PaletteLights) {
  const cellW = w / COLS;
  const cellH = h / VISIBLE;
  const newest = newestRow(state);
  for (let back = 0; back < VISIBLE; back++) {
    const row = (newest - back + ROWS) % ROWS;
    const y = h - (back + 1) * cellH;
    for (let c = 0; c < COLS; c++) {
      const v = state.image[(row * COLS + c) * 4] / 255;
      const t = Math.min(1, v * state.amp / 0.75);
      const col: [number, number, number] = [
        lights.fluid[0] * 0.5 + (lights.light[0] * 0.75 - lights.fluid[0] * 0.5) * t,
        lights.fluid[1] * 0.5 + (lights.light[1] * 0.75 - lights.fluid[1] * 0.5) * t,
        lights.fluid[2] * 0.5 + (lights.light[2] * 0.75 - lights.fluid[2] * 0.5) * t,
      ];
      ctx.fillStyle = rgb(col, 1 - back / VISIBLE);
      ctx.fillRect(c * cellW, y, cellW + 0.5, cellH + 0.5);
    }
  }
}

export default function TerrainVisualizer({ material, pattern, ...props }: VisualizerProps & TerrainOptions) {
  // The scene lives as long as the canvas; its options follow the props through a ref.
  const options = useRef<TerrainOptions>({ material, pattern });
  options.current = { material, pattern };
  const createScene = useMemo(() => (ctx: CanvasRenderingContext2D) => createTerrainScene(ctx, options), []);
  // Full resolution: the mesh and shading run on the GPU (see terrainGl),
  // which also draws the Cel look itself, on the map's own contour lines.
  return <VisualizerCanvas {...props} createScene={createScene} celShaded />;
}

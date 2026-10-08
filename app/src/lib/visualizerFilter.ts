import type { VisualizerFilter } from "../types/style";

/** Pixelate renders at this fraction of the window: 5 px blocks. */
const PIXELATE_RESOLUTION = 0.2;
/** CRT renders at half resolution, so pixels show behind the scanlines. */
const CRT_RESOLUTION = 0.5;

/**
 * Canvas resolution for a scene under a filter. Filters only ever lower it,
 * so they make a visualizer cheaper, never dearer.
 */
export function filterResolution(sceneResolution: number, filter: VisualizerFilter): number {
  switch (filter) {
    case "pixelate":
      return Math.min(sceneResolution, PIXELATE_RESOLUTION);
    case "crt":
      return Math.min(sceneResolution, CRT_RESOLUTION);
    default:
      return sceneResolution;
  }
}

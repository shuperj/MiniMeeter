import { VISUALIZER_FILTERS, type VisualizerFilter } from "../types/style";

/** Pixelate renders at this fraction of the window: 5 px blocks. */
const PIXELATE_RESOLUTION = 0.2;
/** CRT renders at half resolution, so pixels show behind the scanlines. */
const CRT_RESOLUTION = 0.5;

/**
 * Canvas resolution for a scene under its filters. Filters only ever lower
 * it, so they make a visualizer cheaper, never dearer; Cel keeps whatever
 * resolution it is given, since its outlines need the pixels.
 */
export function filterResolution(sceneResolution: number, filters: readonly VisualizerFilter[]): number {
  let res = sceneResolution;
  if (filters.includes("pixelate")) res = Math.min(res, PIXELATE_RESOLUTION);
  if (filters.includes("crt")) res = Math.min(res, CRT_RESOLUTION);
  return res;
}

/** A saved filter list, cleaned: known filters only, once each, in application order. */
export function normalizeFilters(raw: unknown): VisualizerFilter[] {
  if (!Array.isArray(raw)) return [];
  return VISUALIZER_FILTERS.filter((f) => raw.includes(f));
}

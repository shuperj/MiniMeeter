import { useRef, useEffect } from "react";
import type { RefObject } from "react";
import { createFramePacer, frameDelta, VISUALIZER_FPS } from "../../lib/frameLoop";
import type { SpectrumState } from "../../hooks/useSpectrum";
import type { CelEdges, VisualizerFilter } from "../../types/style";
import { filterResolution } from "../../lib/visualizerFilter";
import { createCelGl, type CelGl } from "./celGl";

// CRT look: scanlines and a vignette as a static overlay (composited, not
// redrawn), plus a slight red/blue fringe and a punchier picture on the canvas.
const CRT_OVERLAY =
  "repeating-linear-gradient(to bottom, rgba(0,0,0,0.32) 0px, rgba(0,0,0,0.32) 1px, transparent 1px, transparent 3px), " +
  "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.45) 100%)";
const CRT_CANVAS_FILTER =
  "saturate(1.3) contrast(1.15) drop-shadow(0.7px 0 0 rgba(255,40,40,0.45)) drop-shadow(-0.7px 0 0 rgba(40,150,255,0.45))";

/** Spectrum older than this is treated as unavailable (capture stopped). */
const SPECTRUM_STALE_MS = 500;

const NO_FILTERS: readonly VisualizerFilter[] = [];

export interface VisualizerProps {
  opacity: number;
  /** Reactivity setting, 0..1. */
  intensity: number;
  /** Speed setting, 0..1; 0.5 is normal. */
  speed?: number;
  /** Frame rate cap. */
  fps?: number;
  /** Post effects: pixelate, cel, CRT, in any combination. */
  filters?: readonly VisualizerFilter[];
  /** Outline colour for the Cel filter. */
  celEdges?: CelEdges;
  masterLevel: number;
  paused?: boolean;
  /** Live frequency bands, for visualizers that use them (see useSpectrum). */
  spectrum?: RefObject<SpectrumState>;
}

export interface Frame {
  /** Canvas backing size in pixels (already scaled by the scene's resolution). */
  w: number;
  h: number;
  /**
   * Real time since the last drawn frame, in 60 Hz frames. Use it for fades,
   * trails and level envelopes, which shouldn't change with the Speed setting.
   */
  dt: number;
  /** dt scaled by the Speed setting: advance time and positions by this. */
  motion: number;
  level: number;
  /**
   * Reactivity as a gain, 0..2: 1 at the default setting, 0 = ignore audio.
   * Multiply audio-driven effects by it.
   */
  reactivity: number;
  /** Visualizer color as "r,g,b", for rgb()/rgba() strings. */
  rgb: string;
  /**
   * Every color to use, each "r,g,b". One entry (the visualizer color) unless
   * the user picked a palette. The array is reused until the colors change.
   */
  palette: readonly string[];
  /**
   * 0..1 per frequency band (low to high), or null when no spectrum is
   * flowing — visualizers fall back to the level then.
   */
  spectrum: Float32Array | null;
  /**
   * The Cel filter's edge colour while it is on, else null. Only scenes
   * rendered with `celShaded` need it: they draw the look themselves.
   */
  cel: CelEdges | null;
}

export interface Scene {
  /** Called after every backing-store resize, which also resets all context state. */
  resize?(w: number, h: number): void;
  draw(frame: Frame): void;
}

export type SceneFactory = (ctx: CanvasRenderingContext2D) => Scene;

// --viz-* are set inline on <html> by App, so read the inline declaration:
// unlike getComputedStyle this never forces a style recalc mid-frame.
function readVizRgb(): string {
  const s = document.documentElement.style;
  const r = s.getPropertyValue("--viz-r").trim() || "58";
  const g = s.getPropertyValue("--viz-g").trim() || "134";
  const b = s.getPropertyValue("--viz-b").trim() || "255";
  return `${r},${g},${b}`;
}

// The palette var only changes when settings do; split it once per change.
let paletteSource: string | null = null;
let paletteCache: string[] = [];
function readVizPalette(rgb: string): readonly string[] {
  const raw = document.documentElement.style.getPropertyValue("--viz-palette").trim();
  const key = raw || rgb;
  if (key !== paletteSource) {
    paletteSource = key;
    paletteCache = raw ? raw.split("|") : [rgb];
  }
  return paletteCache;
}

/**
 * Shared canvas + frame loop for the background visualizers. Draws at a capped
 * rate (see lib/frameLoop), keeps scene state across pause/resume, and renders
 * at `resolution` × the CSS size so soft scenes can use fewer pixels.
 *
 * The Cel filter is a pass over the finished frame (see celGl) into a second
 * canvas shown in the scene's place, so scenes that paint over their previous
 * frame (trails) never see their own filtered output. A scene that draws the
 * cel look itself (Ferrofluid, in 3D) is rendered with `celShaded` and gets
 * the edge colour in its frame instead.
 */
export default function VisualizerCanvas({
  opacity,
  intensity,
  masterLevel,
  paused = false,
  createScene,
  resolution = 1,
  celShaded = false,
  spectrum,
  speed = 0.5,
  fps = VISUALIZER_FPS,
  filters = NO_FILTERS,
  celEdges = "dark",
}: VisualizerProps & { createScene: SceneFactory; resolution?: number; celShaded?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const celCanvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const levelRef = useRef(masterLevel);
  const intensityRef = useRef(intensity);

  useEffect(() => { levelRef.current = masterLevel; }, [masterLevel]);
  useEffect(() => { intensityRef.current = intensity; }, [intensity]);
  // Speed 0..1 maps to about 0.35x .. 1x (at 0.5) .. 2.8x.
  const fpsRef = useRef(fps);
  useEffect(() => { fpsRef.current = fps; }, [fps]);
  // A filter can lower the resolution (never raise it).
  const res = filterResolution(resolution, filters);
  const speedRef = useRef(1);
  useEffect(() => { speedRef.current = Math.pow(2, (speed - 0.5) * 3); }, [speed]);
  // Cel: the edge colour while it is on, and whether the pass runs here.
  const cel = filters.includes("cel") ? celEdges : null;
  const celPass = cel !== null && !celShaded;
  const celRef = useRef<CelEdges | null>(cel);
  const celPassRef = useRef(celPass);
  useEffect(() => { celRef.current = cel; celPassRef.current = celPass; }, [cel, celPass]);
  // The pass's renderer, made on first use (undefined = not tried yet).
  const celGlRef = useRef<CelGl | null | undefined>(undefined);

  useEffect(() => {
    if (paused) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const fresh = !sceneRef.current;
    const scene = sceneRef.current ??= createScene(ctx);

    const resize = (force = false) => {
      const w = Math.round(canvas.clientWidth * res);
      const h = Math.round(canvas.clientHeight * res);
      // Assigning width/height clears the canvas even when unchanged, so
      // resuming from pause only touches it if the size really moved.
      if (!force && w === canvas.width && h === canvas.height) return;
      canvas.width = w;
      canvas.height = h;
      scene.resize?.(w, h);
    };
    resize(fresh);
    const observer = new ResizeObserver(() => resize());
    observer.observe(canvas);

    let raf = 0;
    let last = performance.now();
    const pace = createFramePacer();
    let debugFrames = 0;
    let debugSince = performance.now();

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!pace(now, fpsRef.current)) return;
      // TEMP DEBUG (focus investigation): report the real draw rate.
      debugFrames++;
      if (now - debugSince > 2000) {
        const msg = `drawn ${(debugFrames * 1000 / (now - debugSince)).toFixed(1)} fps (cap ${fpsRef.current})`;
        import("@tauri-apps/api/core").then(({ invoke }) => invoke("debug_log", { msg })).catch(() => {});
        debugFrames = 0;
        debugSince = now;
      }
      const elapsed = now - last;
      last = now;

      const w = canvas.width;
      const h = canvas.height;
      if (w === 0 || h === 0) return;

      const rgb = readVizRgb();
      const dt = frameDelta(elapsed);
      scene.draw({
        w,
        h,
        dt,
        motion: dt * speedRef.current,
        level: levelRef.current,
        reactivity: intensityRef.current * 2,
        rgb,
        palette: readVizPalette(rgb),
        spectrum:
          spectrum?.current && now - spectrum.current.updatedAt < SPECTRUM_STALE_MS
            ? spectrum.current.bands
            : null,
        cel: celRef.current,
      });

      if (celPassRef.current && celRef.current && celCanvasRef.current) {
        if (celGlRef.current === undefined) celGlRef.current = createCelGl(celCanvasRef.current);
        const celGl = celGlRef.current;
        if (celGl) {
          if (celGl.canvas.width !== w || celGl.canvas.height !== h) celGl.resize(w, h);
          celGl.render(canvas, celRef.current);
        }
      }
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
    // createScene is a module-level factory per visualizer, so it never changes.
  }, [paused, res]);

  const crt = filters.includes("crt");
  // Chunky filters show their pixels crisp instead of smoothing them over.
  const imageRendering = filters.includes("pixelate") || crt ? "pixelated" : undefined;
  const canvasFilter = crt ? CRT_CANVAS_FILTER : undefined;

  return (
    <>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{
          opacity,
          imageRendering,
          filter: canvasFilter,
          // Under the cel pass the scene still draws here, but only its
          // filtered copy is shown. (No WebGL: the pass is skipped, so show it.)
          visibility: celPass && celGlRef.current !== null ? "hidden" : undefined,
        }}
      />
      {celPass && (
        <canvas
          ref={celCanvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ opacity, imageRendering, filter: canvasFilter }}
        />
      )}
      {crt && (
        <div className="absolute inset-0 pointer-events-none" style={{ background: CRT_OVERLAY, opacity }} />
      )}
    </>
  );
}

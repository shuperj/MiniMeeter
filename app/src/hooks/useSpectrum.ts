import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** Number of bands in `vm:spectrum`; matches spectrum::analysis::BANDS in Rust. */
export const SPECTRUM_BANDS = 48;

export interface SpectrumState {
  /** 0..1 per band, low to high frequency, log-spaced 40 Hz - 16 kHz. */
  bands: Float32Array;
  /** performance.now() of the last update; 0 if none has arrived. */
  updatedAt: number;
}

/**
 * Real frequency data from Rust's loopback capture (see src-tauri/src/spectrum).
 *
 * Capture only runs while `enabled`, so the caller passes true only when a
 * visualizer that uses it is on screen and animating. Updates land in a ref,
 * not React state: they arrive 30 times a second and only the canvas loop
 * reads them, so re-rendering on each would be pure waste.
 */
export function useSpectrum(enabled: boolean) {
  const ref = useRef<SpectrumState>({ bands: new Float32Array(SPECTRUM_BANDS), updatedAt: 0 });

  useEffect(() => {
    if (!enabled) return;
    invoke("vm_set_spectrum_enabled", { enabled: true }).catch((e) => {
      console.warn("Failed to start spectrum capture:", e);
    });
    const unlisten = listen<{ bands: number[] }>("vm:spectrum", (event) => {
      const bands = ref.current.bands;
      const incoming = event.payload.bands;
      for (let i = 0; i < SPECTRUM_BANDS; i++) bands[i] = (incoming[i] ?? 0) / 255;
      ref.current.updatedAt = performance.now();
    });
    return () => {
      unlisten.then((fn) => fn());
      ref.current.updatedAt = 0;
      invoke("vm_set_spectrum_enabled", { enabled: false }).catch(() => {});
    };
  }, [enabled]);

  return ref;
}

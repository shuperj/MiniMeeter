// Spectrum, shaped for visualizers: the 48 log-spaced bands from Rust's
// capture (hooks/useSpectrum) folded into however many groups a visualizer
// has parts (waves, rings, blobs...), plus bass / mid / treble summaries and a
// kick-drum "onset". With no spectrum it all falls back to the level, so a
// visualizer never has to care whether capture is running.

import { perFrameAlpha } from "./frameLoop";
import { createLevelEnvelope } from "./levelEnvelope";

const BANDS = 48;
const LOW_HZ = 40;
const HIGH_HZ = 16_000;

/** Band levels below this are background; the rest stretch to 0..1. */
const FLOOR = 0.18;
const RANGE = 0.55;

// Rates per 60 Hz frame, rescaled by dt.
const ATTACK = 0.6;
const RELEASE = 0.15;
const BASS_AVERAGE_RATE = 0.05;
const ONSET_DECAY = 0.85;
const ONSET_THRESHOLD = 0.08;
const ONSET_GAIN = 3;

/** First band at or above `hz`. */
function bandAt(hz: number): number {
  const t = Math.log(hz / LOW_HZ) / Math.log(HIGH_HZ / LOW_HZ);
  return Math.min(BANDS, Math.max(0, Math.round(t * BANDS)));
}

const BASS_END = bandAt(250);
const MID_END = bandAt(4_000);

export interface BandGroupsOutput {
  /** 0..1 per group, low to high frequency. Reused between calls. */
  groups: Float32Array;
  bass: number;
  mid: number;
  treble: number;
  /** 0..1, jumps when the bass kicks and decays quickly. */
  onset: number;
}

function shaped(spectrum: Float32Array, from: number, to: number): number {
  let sum = 0;
  for (let b = from; b < to; b++) sum += Math.max(0, (spectrum[b] - FLOOR) / RANGE);
  return Math.min(1, sum / Math.max(1, to - from));
}

export function createBandGroups(count: number) {
  const groups = new Float32Array(count);
  const out: BandGroupsOutput = { groups, bass: 0, mid: 0, treble: 0, onset: 0 };
  const envelope = createLevelEnvelope();
  let bassAverage = 0;

  const follow = (current: number, target: number, dt: number) =>
    current + (target - current) * perFrameAlpha(target > current ? ATTACK : RELEASE, dt);

  return (spectrum: Float32Array | null, level: number, dt: number): BandGroupsOutput => {
    if (!spectrum) {
      const { smooth, hit } = envelope(level, dt);
      groups.fill(smooth);
      out.bass = out.mid = out.treble = smooth;
      out.onset = hit;
      return out;
    }

    for (let g = 0; g < count; g++) {
      const from = Math.floor((g * BANDS) / count);
      const to = Math.floor(((g + 1) * BANDS) / count);
      groups[g] = follow(groups[g], shaped(spectrum, from, to), dt);
    }

    const bassNow = shaped(spectrum, 0, BASS_END);
    const rise = (bassNow - bassAverage - ONSET_THRESHOLD) * ONSET_GAIN;
    out.onset = Math.max(out.onset * Math.pow(ONSET_DECAY, dt), Math.min(1, Math.max(0, rise)));
    bassAverage += (bassNow - bassAverage) * perFrameAlpha(BASS_AVERAGE_RATE, dt);

    out.bass = follow(out.bass, bassNow, dt);
    out.mid = follow(out.mid, shaped(spectrum, BASS_END, MID_END), dt);
    out.treble = follow(out.treble, shaped(spectrum, MID_END, BANDS), dt);
    return out;
  };
}

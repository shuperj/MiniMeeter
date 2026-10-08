// Turns the raw master level (~30 Hz from Voicemeeter) into something
// visualizers can move with: a smoothed level and a "hit" that fires when the
// level jumps above its recent average — a rough stand-in for a beat, since
// all we get is one loudness number, not a spectrum.

import { perFrameAlpha } from "./frameLoop";

export interface LevelEnvelopeOutput {
  /** Fast-attack, slow-release level, 0..1. */
  smooth: number;
  /** 0..1, jumps on a sudden rise in level and decays quickly. */
  hit: number;
}

// All rates are per 60 Hz frame, rescaled by dt.
const ATTACK = 0.5;
const RELEASE = 0.08;
/** How fast the "recent average" a hit is measured against catches up. */
const AVERAGE_RATE = 0.05;
/** Per-frame multiplier while a hit decays. */
const HIT_DECAY = 0.85;
/** How far above the recent average the level must jump to register at all. */
const HIT_THRESHOLD = 0.1;
const HIT_GAIN = 2.5;

export function createLevelEnvelope() {
  let smooth = 0;
  let average = 0;
  let hit = 0;

  return (level: number, dt: number): LevelEnvelopeOutput => {
    const rise = (level - average - HIT_THRESHOLD) * HIT_GAIN;
    hit = Math.max(hit * Math.pow(HIT_DECAY, dt), Math.min(1, Math.max(0, rise)));

    const rate = level > smooth ? ATTACK : RELEASE;
    smooth += (level - smooth) * perFrameAlpha(rate, dt);
    average += (level - average) * perFrameAlpha(AVERAGE_RATE, dt);

    return { smooth, hit };
  };
}

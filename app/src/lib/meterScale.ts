/** Quietest level the meters show; anything below reads as empty. */
export const METER_FLOOR_DB = -60;

/**
 * Voicemeeter reports levels as linear amplitude (1 = 0 dBFS). Drawn directly, a
 * healthy -18 dB signal fills only 12% of a meter, so map to a dB scale: empty at
 * the floor, full at 0 dBFS.
 */
export function levelToMeter(level: number): number {
  if (level <= 0) return 0;
  const db = 20 * Math.log10(level);
  return Math.max(0, Math.min(1, 1 - db / METER_FLOOR_DB));
}

/**
 * The level the background visualizers react to: the loudest *pre-fader*
 * level among unmuted strips.
 *
 * Pre-fader, because listening volume usually lives on the faders. Music on a
 * virtual input pulled down to -20 dB reads ten times quieter post-fader, so
 * the visualizer sat still while a +3 dB mic drove it.
 */
export function visualizerLevel(
  preFaderLevels: ReadonlyMap<number, number>,
  strips: ReadonlyMap<number, { muted: boolean }>,
): number {
  let max = 0;
  for (const [strip, level] of preFaderLevels) {
    if (strips.get(strip)?.muted) continue;
    if (level > max) max = level;
  }
  return max;
}

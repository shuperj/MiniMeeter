/** Per-channel settings that no longer exist: fader limits, double-click default, meter scale. */
const LEGACY_CHANNEL_KEYS = ["minDb", "maxDb", "defaultDb", "levelScale"];
/** Style settings that no longer exist: window opacity, and the now always-on output level. */
const LEGACY_STYLE_KEYS = ["globalOpacity", "showOutputLevel"];

/** `saved` without `keys`, or the same object when it had none of them. */
function without<T extends object>(saved: T, keys: readonly string[]): T {
  if (!keys.some((k) => k in saved)) return saved;
  const rest = { ...saved } as Record<string, unknown>;
  for (const k of keys) delete rest[k];
  return rest as T;
}

/**
 * Saved settings with retired fields removed. The file outlives the app (an
 * uninstall leaves it alone), so nothing else would ever clear them. Returns the
 * input itself when there is nothing to remove, so callers can skip the write.
 */
export function withoutLegacyChannelFields<T extends object>(channels: T[]): T[] {
  const cleaned = channels.map((c) => without(c, LEGACY_CHANNEL_KEYS));
  return cleaned.some((c, i) => c !== channels[i]) ? cleaned : channels;
}

export function withoutLegacyStyleFields<T extends object>(style: T): T {
  return without(style, LEGACY_STYLE_KEYS);
}

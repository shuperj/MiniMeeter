import type { AppSession } from "../types/appSessions";

/** Below full volume by more than rounding: the user has set this app's level. */
const ADJUSTED_BELOW = 0.995;

type RowSession = Pick<AppSession, "key" | "state" | "muted" | "volume">;

/**
 * Split an input's apps into the ones worth showing and the rest. Shown: playing,
 * muted or turned down by the user, or playing at any point since the panel
 * opened, so a row doesn't vanish the moment its app pauses. Hidden apps always
 * go to the rest.
 */
export function splitRows<T extends RowSession>(
  sessions: readonly T[],
  isHidden: (session: T) => boolean,
  seenPlaying: ReadonlySet<string>,
): { main: T[]; more: T[] } {
  const main: T[] = [];
  const more: T[] = [];
  for (const s of sessions) {
    const worthShowing =
      s.state === "active" || s.muted || s.volume < ADJUSTED_BELOW || seenPlaying.has(s.key);
    (worthShowing && !isHidden(s) ? main : more).push(s);
  }
  return { main, more };
}

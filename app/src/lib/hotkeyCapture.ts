/**
 * Tracks whether a hotkey recorder in Settings is waiting for a key press.
 *
 * Windows delivers a key registered with RegisterHotKey to the hotkey only,
 * never to the focused window. So while recording, every global shortcut has
 * to be unregistered, or pressing a key that's already bound (F15 for a mute,
 * say, with Ctrl+Shift pre-picked for the new binding) fires that binding and
 * the recorder never sees it. useGlobalShortcuts reads this and stands down.
 */
export function createHotkeyCapture() {
  let active = 0;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());

  return {
    isCapturing: () => active > 0,

    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },

    /** Start a capture; call the returned function (once) to end it. */
    begin(): () => void {
      active++;
      if (active === 1) notify();
      let ended = false;
      return () => {
        if (ended) return;
        ended = true;
        active--;
        if (active === 0) notify();
      };
    },
  };
}

export const hotkeyCapture = createHotkeyCapture();

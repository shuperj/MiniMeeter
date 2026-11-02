import { useEffect, useState, useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ChannelConfig } from "../config";
import type { FxGroup, HotkeyBinding } from "../types/fx";
import { hotkeyCapture } from "../lib/hotkeyCapture";

/** The keyboard's own volume keys, in Tauri accelerator format. */
const SYSTEM_KEY_BINDINGS: HotkeyBinding[] = [
  { hotkey: "AudioVolumeUp", action: { type: "volumeUp" } },
  { hotkey: "AudioVolumeDown", action: { type: "volumeDown" } },
  { hotkey: "AudioVolumeMute", action: { type: "muteOutputs" } },
];

/** How often to retry volume keys another program is holding. */
const SYSTEM_KEYS_RETRY_MS = 5000;

/**
 * Syncs every hotkey binding (channel mutes + FX groups + volume keys) to the
 * Rust side, which registers OS-level global shortcuts and dispatches them
 * directly.
 *
 * They all go through one `vm_sync_shortcuts` call because it unregisters
 * everything first — syncing them separately would drop whichever set went
 * second. FX group *contents* are synced separately; that never touches the
 * shortcut registrations.
 *
 * While a hotkey recorder is capturing, nothing is registered (the previous
 * run's cleanup already cleared it), so a key that's already bound still
 * reaches the recorder. See lib/hotkeyCapture.
 *
 * Volume keys are listed last so a hotkey the user bound by hand wins. Windows
 * refuses them while Voicemeeter's own hook holds them, so `systemKeysBlocked`
 * reports that and the sync retries, picking them up once the hook is turned off.
 */
export function useGlobalShortcuts(channelConfigs: ChannelConfig[], fxGroups: FxGroup[], systemKeys: boolean) {
  const capturing = useSyncExternalStore(hotkeyCapture.subscribe, hotkeyCapture.isCapturing);
  const [systemKeysBlocked, setSystemKeysBlocked] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (capturing) return;

    const bindings: HotkeyBinding[] = [
      ...channelConfigs
        .filter((ch) => ch.hasMute && ch.muteHotkey)
        .map((ch): HotkeyBinding => ({
          hotkey: ch.muteHotkey!,
          action: { type: "toggleMute", strip: ch.strip },
        })),
      ...fxGroups
        .filter((g) => g.hotkey)
        .map((g): HotkeyBinding => ({
          hotkey: g.hotkey!,
          action: { type: "toggleFxGroup", id: g.id },
        })),
      ...(systemKeys ? SYSTEM_KEY_BINDINGS : []),
    ];

    let stale = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    invoke<string[]>("vm_sync_shortcuts", { bindings })
      .then((failed) => {
        if (stale) return;
        const blocked = SYSTEM_KEY_BINDINGS.some((b) => failed.includes(b.hotkey));
        setSystemKeysBlocked(systemKeys && blocked);
        if (systemKeys && blocked) {
          retryTimer = setTimeout(() => setRetry((n) => n + 1), SYSTEM_KEYS_RETRY_MS);
        }
      })
      .catch((e) => {
        console.warn("Failed to sync shortcuts:", e);
      });

    return () => {
      stale = true;
      clearTimeout(retryTimer);
      invoke("vm_sync_shortcuts", { bindings: [] }).catch(() => {});
    };
  }, [channelConfigs, fxGroups, systemKeys, capturing, retry]);

  useEffect(() => {
    invoke("vm_sync_fx_groups", { groups: fxGroups }).catch((e) => {
      console.warn("Failed to sync FX groups:", e);
    });
  }, [fxGroups]);

  return { systemKeysBlocked };
}

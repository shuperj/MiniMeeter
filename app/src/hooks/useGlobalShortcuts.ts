import { useEffect, useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ChannelConfig } from "../config";
import type { FxGroup, HotkeyBinding } from "../types/fx";
import { hotkeyCapture } from "../lib/hotkeyCapture";

/**
 * Syncs every hotkey binding (channel mutes + FX groups) to the Rust side,
 * which registers OS-level global shortcuts and dispatches them directly.
 *
 * Both kinds go through one `vm_sync_shortcuts` call because it unregisters
 * everything first — syncing them separately would drop whichever set went
 * second. FX group *contents* are synced separately; that never touches the
 * shortcut registrations.
 *
 * While a hotkey recorder is capturing, nothing is registered (the previous
 * run's cleanup already cleared it), so a key that's already bound still
 * reaches the recorder. See lib/hotkeyCapture.
 */
export function useGlobalShortcuts(channelConfigs: ChannelConfig[], fxGroups: FxGroup[]) {
  const capturing = useSyncExternalStore(hotkeyCapture.subscribe, hotkeyCapture.isCapturing);

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
    ];

    invoke("vm_sync_shortcuts", { bindings }).catch((e) => {
      console.warn("Failed to sync shortcuts:", e);
    });

    return () => {
      invoke("vm_sync_shortcuts", { bindings: [] }).catch(() => {});
    };
  }, [channelConfigs, fxGroups, capturing]);

  useEffect(() => {
    invoke("vm_sync_fx_groups", { groups: fxGroups }).catch((e) => {
      console.warn("Failed to sync FX groups:", e);
    });
  }, [fxGroups]);
}

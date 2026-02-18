import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ChannelConfig } from "../config";

/**
 * Syncs mute hotkey configs to the Rust side, which registers OS-level
 * global shortcuts and toggles mute directly via the Voicemeeter API.
 */
export function useGlobalShortcuts(channelConfigs: ChannelConfig[]) {
  useEffect(() => {
    const configs = channelConfigs
      .filter((ch) => ch.hasMute && ch.muteHotkey)
      .map((ch) => ({ strip: ch.strip, hotkey: ch.muteHotkey! }));

    invoke("vm_sync_shortcuts", { configs }).catch((e) => {
      console.warn("Failed to sync mute shortcuts:", e);
    });

    return () => {
      // Clean up all shortcuts on unmount
      invoke("vm_sync_shortcuts", { configs: [] }).catch(() => {});
    };
  }, [channelConfigs]);
}

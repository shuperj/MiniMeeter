import { useEffect, useRef, useCallback } from "react";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import type { ChannelConfig } from "../config";

export function useGlobalShortcuts(
  channelConfigs: ChannelConfig[],
  toggleMute: (strip: number) => void,
) {
  const registered = useRef<string[]>([]);
  const toggleMuteRef = useRef(toggleMute);

  // Keep ref current so the shortcut handler always calls the latest function
  useEffect(() => {
    toggleMuteRef.current = toggleMute;
  }, [toggleMute]);

  const unregisterAll = useCallback(async () => {
    for (const shortcut of registered.current) {
      try {
        await unregister(shortcut);
      } catch {
        // Already unregistered or invalid
      }
    }
    registered.current = [];
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function registerAll() {
      // Unregister previous shortcuts first
      await unregisterAll();
      if (cancelled) return;

      const bindings = channelConfigs.filter((ch) => ch.hasMute && ch.muteHotkey);
      const newRegistered: string[] = [];

      for (const ch of bindings) {
        const hotkey = ch.muteHotkey!;
        const strip = ch.strip;
        try {
          await register(hotkey, (event) => {
            // Only fire on key down, not key up
            if (event.state === "Pressed") {
              toggleMuteRef.current(strip);
            }
          });
          newRegistered.push(hotkey);
        } catch {
          // Shortcut might be taken by another app — skip silently
        }
      }

      if (!cancelled) {
        registered.current = newRegistered;
      }
    }

    registerAll();

    return () => {
      cancelled = true;
      unregisterAll();
    };
  }, [channelConfigs, unregisterAll]);
}

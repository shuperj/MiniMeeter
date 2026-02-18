import { useEffect, useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ChannelConfig } from "../config";

interface StripState {
  strip: number;
  gain: number;
  muted: boolean;
}

interface AllStripsState {
  strips: StripState[];
}

interface StripLevel {
  strip: number;
  level: number;
}

interface AllStripLevels {
  levels: StripLevel[];
}

interface BusLevel {
  bus: number;
  level: number;
}

interface AllBusLevels {
  levels: BusLevel[];
}

export interface ChannelState {
  gain: number;
  muted: boolean;
}

export function useVoicemeeter(channelConfigs: ChannelConfig[]) {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channels, setChannels] = useState<Map<number, ChannelState>>(() => {
    const map = new Map<number, ChannelState>();
    for (const ch of channelConfigs) {
      map.set(ch.strip, { gain: ch.defaultDb, muted: false });
    }
    return map;
  });

  const [levels, setLevels] = useState<Map<number, number>>(() => {
    const map = new Map<number, number>();
    for (const ch of channelConfigs) {
      map.set(ch.strip, 0);
    }
    return map;
  });

  const [busLevels, setBusLevels] = useState<Map<number, number>>(new Map());

  // Track which strips are being actively dragged to avoid overwriting
  const dragging = useRef<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      try {
        await invoke("vm_login");
        if (cancelled) return;
        setConnected(true);
        setError(null);

        // Read initial state
        const state = await invoke<AllStripsState>("vm_get_all_strips");
        if (cancelled) return;
        setChannels((prev) => {
          const next = new Map(prev);
          for (const s of state.strips) {
            next.set(s.strip, { gain: s.gain, muted: s.muted });
          }
          return next;
        });
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    }

    connect();

    const unlisten = listen<AllStripsState>("vm:state-update", (event) => {
      setChannels((prev) => {
        const next = new Map(prev);
        for (const s of event.payload.strips) {
          // Don't overwrite a strip the user is currently dragging
          if (!dragging.current.has(s.strip)) {
            next.set(s.strip, { gain: s.gain, muted: s.muted });
          }
        }
        return next;
      });
    });

    const unlistenLevels = listen<AllStripLevels>("vm:levels", (event) => {
      setLevels((prev) => {
        const next = new Map(prev);
        for (const l of event.payload.levels) {
          next.set(l.strip, l.level);
        }
        return next;
      });
    });

    const unlistenBusLevels = listen<AllBusLevels>("vm:bus-levels", (event) => {
      setBusLevels((prev) => {
        const next = new Map(prev);
        for (const l of event.payload.levels) {
          next.set(l.bus, l.level);
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
      unlisten.then((fn) => fn());
      unlistenLevels.then((fn) => fn());
      unlistenBusLevels.then((fn) => fn());
      invoke("vm_logout").catch(() => {});
    };
  }, []);

  const setGain = useCallback(async (strip: number, value: number) => {
    setChannels((prev) => {
      const next = new Map(prev);
      const current = next.get(strip) ?? { gain: value, muted: false };
      next.set(strip, { ...current, gain: value });
      return next;
    });
    try {
      await invoke("vm_set_gain", { strip, value });
    } catch {
      // Silently fail — polling will correct state
    }
  }, []);

  const setMute = useCallback(async (strip: number, muted: boolean) => {
    setChannels((prev) => {
      const next = new Map(prev);
      const current = next.get(strip) ?? { gain: 0, muted };
      next.set(strip, { ...current, muted });
      return next;
    });
    try {
      await invoke("vm_set_mute", { strip, muted });
    } catch {
      // Silently fail — polling will correct state
    }
  }, []);

  const startDragging = useCallback((strip: number) => {
    dragging.current.add(strip);
  }, []);

  const stopDragging = useCallback((strip: number) => {
    dragging.current.delete(strip);
  }, []);

  return { connected, error, channels, levels, busLevels, setGain, setMute, startDragging, stopDragging };
}

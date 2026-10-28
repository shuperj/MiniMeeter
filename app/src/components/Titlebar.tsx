import { useState, useEffect, useRef, type CSSProperties, type RefObject } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import type { A1Device } from "../config";
import type { WindowPreset } from "../types/style";
import type { BusStatus } from "../hooks/useVoicemeeter";
import { activeOutputIndex, busLabel, outputsForBus } from "../lib/outputs";
import { invoke } from "@tauri-apps/api/core";

interface TitlebarProps {
  /** Every configured output device, each tagged with the bus it's for. */
  outputs: A1Device[];
  /** The hardware bus the picker shows and switches (0 = A1). */
  outputBus: number;
  /** Hardware buses this edition has, offered by right-clicking the picker. */
  hwBusCount: number;
  onOutputBusChange: (bus: number) => void;
  /** Live mute and device of each hardware bus. */
  busStates: Map<number, BusStatus>;
  onBusMuteToggle: (bus: number, muted: boolean) => void;
  onSettingsClick: () => void;
  onAppsClick: () => void;
  appsOpen: boolean;
  busGain: number;
  showOutputLevel: boolean;
  /** Engine is temporarily unreachable (restarting after a device switch, etc.) */
  reconnecting?: boolean;
  pinned: boolean;
  onPinToggle: () => void;
  /** Sizes offered when right-clicking the minimize button. */
  windowPresets: WindowPreset[];
}

/** The bar's surface: the accent, with its readable text colour. */
const SURFACE = { backgroundColor: "var(--accent)", "--titlebar-fg": "var(--accent-fg)" } as CSSProperties;

/** Muted output: the same red as a muted channel. */
const MUTED_BG = "rgba(239,68,68,0.9)";

const menuCls =
  "absolute right-0 top-full mt-1 z-50 min-w-[clamp(96px,26vw,150px)] rounded-[4px] border border-white/15 bg-[#1a1a1a]/95 py-1 shadow-lg";
const menuHeaderCls = "px-2 pb-1 text-[clamp(0.45rem,1.3vw,0.6rem)] uppercase tracking-wide text-white/35";
const menuItemCls =
  "w-full text-left px-2 py-[3px] bg-transparent border-none cursor-pointer text-[clamp(0.5rem,1.5vw,0.65rem)] text-white/80 hover:bg-white/10 flex items-center justify-between gap-2";

function formatDb(v: number): string {
  const rounded = Math.round(v);
  const sign = rounded >= 0 ? "+" : "-";
  return `${sign}${String(Math.abs(rounded)).padStart(2, "0")}dB`;
}

/** Close a popup menu on an outside click or Escape. */
function useDismiss(open: boolean, ref: RefObject<HTMLElement | null>, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) closeRef.current();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("mousedown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("mousedown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, ref]);
}

function SpeakerIcon({ muted, className }: { muted: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      {muted ? (
        <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
      ) : (
        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
      )}
    </svg>
  );
}

export default function Titlebar({ outputs, outputBus, hwBusCount, onOutputBusChange, busStates, onBusMuteToggle, onSettingsClick, onAppsClick, appsOpen, busGain, showOutputLevel, reconnecting, pinned, onPinToggle, windowPresets }: TitlebarProps) {
  const appWindow = getCurrentWindow();
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  // The device just picked, shown until Voicemeeter reports it back.
  const [pending, setPending] = useState<{ bus: number; name: string } | null>(null);
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const [busMenuOpen, setBusMenuOpen] = useState(false);
  const presetMenuRef = useRef<HTMLDivElement>(null);
  const busMenuRef = useRef<HTMLDivElement>(null);

  useDismiss(presetMenuOpen, presetMenuRef, () => setPresetMenuOpen(false));
  useDismiss(busMenuOpen, busMenuRef, () => setBusMenuOpen(false));

  const label = busLabel(outputBus);
  const choices = outputsForBus(outputs, outputBus);
  const bus = busStates.get(outputBus);
  const muted = bus?.muted ?? false;
  const activeDevice = pending?.bus === outputBus ? pending.name : bus?.device;
  const activeIdx = activeOutputIndex(choices, activeDevice);

  // Drop the optimistic pick once Voicemeeter reports it, or after a few
  // seconds regardless, so a device Voicemeeter refused can't stick on screen.
  useEffect(() => {
    if (!pending || switching) return;
    if (busStates.get(pending.bus)?.device === pending.name) {
      setPending(null);
      return;
    }
    const timer = window.setTimeout(() => setPending(null), 5000);
    return () => window.clearTimeout(timer);
  }, [busStates, pending, switching]);

  const applyPreset = async (preset: WindowPreset) => {
    setPresetMenuOpen(false);
    try {
      await appWindow.setSize(new LogicalSize(preset.width, preset.height));
    } catch {
      // Nothing useful to do — the window simply stays its current size.
    }
  };

  const handleDeviceChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const device: A1Device | undefined = choices[Number(e.target.value)];
    if (!device) return;

    setSwitchError(null);
    setSwitching(true);
    setPending({ bus: outputBus, name: device.name });

    try {
      await invoke("vm_set_a1_device", { driver: device.driver, name: device.name, bus: outputBus });
    } catch (err) {
      // Never leave the dropdown claiming a device that didn't actually become
      // active — that's what made the old silent catch so confusing.
      setPending(null);
      setSwitchError(String(err));
    } finally {
      setSwitching(false);
    }
  };

  const busy = switching || reconnecting;

  return (
    <div
      // z-[45] keeps the titlebar above the connection overlay (z-40) so the window
      // stays closable/movable while waiting for Voicemeeter. The settings panel
      // (z-50) is still allowed to cover it.
      className="relative z-[45] flex items-center h-[clamp(24px,8dvh,36px)] px-[clamp(6px,2vw,12px)] select-none shrink-0"
      style={SURFACE}
      data-tauri-drag-region
    >
      {/* Pin / always-on-top */}
      <button
        className="w-[clamp(16px,4vw,24px)] h-[clamp(16px,4dvh,24px)] flex items-center justify-center rounded-[3px] border-none cursor-pointer hover:bg-white/20 mr-[clamp(2px,0.5vw,6px)] shrink-0"
        style={{
          color: "var(--titlebar-fg)",
          backgroundColor: pinned ? "rgba(255,255,255,0.28)" : "transparent",
          opacity: pinned ? 1 : 0.65,
        }}
        onClick={onPinToggle}
        title={pinned ? "Unpin — allow other windows on top" : "Pin — keep on top of other windows"}
        aria-pressed={pinned}
      >
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className="w-[clamp(10px,2.5vw,14px)] h-[clamp(10px,2.5vw,14px)]"
        >
          <path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z" />
        </svg>
      </button>

      {/* Settings gear */}
      <button
        className="w-[clamp(16px,4vw,24px)] h-[clamp(16px,4dvh,24px)] flex items-center justify-center rounded-[3px] border-none cursor-pointer hover:bg-white/20 mr-[clamp(2px,0.5vw,6px)] shrink-0"
        style={{ color: "var(--titlebar-fg)", backgroundColor: "transparent" }}
        onClick={onSettingsClick}
        title="Settings"
      >
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-[clamp(10px,2.5vw,14px)] h-[clamp(10px,2.5vw,14px)]"
        >
          <path
            fillRule="evenodd"
            d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.062 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {/* Per-app mixer */}
      <button
        className="w-[clamp(16px,4vw,24px)] h-[clamp(16px,4dvh,24px)] flex items-center justify-center rounded-[3px] border-none cursor-pointer hover:bg-white/20 mr-[clamp(2px,0.5vw,6px)] shrink-0"
        style={{
          color: "var(--titlebar-fg)",
          backgroundColor: appsOpen ? "rgba(255,255,255,0.28)" : "transparent",
        }}
        onClick={onAppsClick}
        title={appsOpen ? "Hide per-app volumes" : "Per-app volumes"}
        aria-pressed={appsOpen}
      >
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-[clamp(10px,2.5vw,14px)] h-[clamp(10px,2.5vw,14px)]"
        >
          <path d="M3 4a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm8 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V4zM3 12a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H4a1 1 0 01-1-1v-4zm8 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
        </svg>
      </button>

      {/* App title — hides at very small widths */}
      <span
        className="text-[clamp(0.55rem,2.2vw,0.75rem)] font-bold truncate hidden min-[260px]:block"
        style={{ color: "var(--titlebar-fg)" }}
        data-tauri-drag-region
      >
        MiniMeeter
      </span>

      {/* Spacer — pushes the output picker and window controls right, and
          stays a drag handle whatever width the title gets. */}
      <div className="flex-1 self-stretch min-w-[clamp(2px,1vw,8px)]" data-tauri-drag-region />

      {/* Reconnecting indicator — engine restart or Voicemeeter briefly gone */}
      {busy && (
        <span
          className="w-[clamp(8px,2vw,11px)] h-[clamp(8px,2vw,11px)] rounded-full border-2 border-white/25 animate-spin mr-[clamp(3px,0.8vw,6px)] shrink-0"
          style={{ borderTopColor: "var(--titlebar-fg)" }}
          title="Reconnecting to Voicemeeter…"
        />
      )}

      {/* Failed device switch */}
      {switchError && !busy && (
        <span
          className="text-[clamp(0.5rem,1.6vw,0.65rem)] font-bold mr-[clamp(3px,0.8vw,6px)] shrink-0 cursor-help text-red-200"
          title={`Output switch failed: ${switchError}`}
          onClick={() => setSwitchError(null)}
        >
          ⚠
        </span>
      )}

      {/* Output gain readout */}
      {showOutputLevel && (
        <span
          className="text-[clamp(0.5rem,1.6vw,0.65rem)] font-bold tabular-nums whitespace-nowrap mr-[clamp(3px,0.8vw,6px)] hidden min-[260px]:block shrink-0"
          style={{ color: "var(--titlebar-fg)", opacity: 0.8 }}
          title={`${label} output gain`}
        >
          {formatDb(busGain)}
        </span>
      )}

      {/* Output picker — mute toggle, bus, device. Right-click to pick the bus.
          The one part of the bar that gives way when the window is narrow. */}
      <div
        className="relative min-w-0 shrink mr-[clamp(4px,1vw,8px)]"
        ref={busMenuRef}
        onContextMenu={(e) => {
          e.preventDefault();
          setBusMenuOpen((v) => !v);
        }}
      >
        <div
          className="flex items-center min-w-0 gap-[clamp(1px,0.4vw,4px)] rounded-[3px] pl-[1px] pr-[clamp(1px,0.4vw,3px)] transition-colors duration-150"
          style={{ backgroundColor: muted ? MUTED_BG : "transparent", color: muted ? "#fff" : "var(--titlebar-fg)" }}
          title={muted ? `${label} is muted` : `Right-click to show another output`}
        >
          <button
            className="w-[clamp(16px,4vw,22px)] h-[clamp(16px,4dvh,22px)] flex items-center justify-center rounded-[3px] border-none cursor-pointer bg-transparent hover:bg-white/20 shrink-0"
            style={{ color: "inherit" }}
            onClick={() => onBusMuteToggle(outputBus, !muted)}
            title={muted ? `Unmute ${label}` : `Mute ${label}`}
            aria-pressed={muted}
          >
            <SpeakerIcon muted={muted} className="w-[clamp(11px,2.8vw,15px)] h-[clamp(11px,2.8vw,15px)]" />
          </button>
          <span className="text-[clamp(0.5rem,1.8vw,0.65rem)] font-bold shrink-0">{label}</span>
          <select
            className="bg-black/20 border-none rounded-[3px] text-[clamp(0.5rem,1.6vw,0.65rem)] px-[clamp(2px,0.5vw,4px)] py-[1px] min-w-[clamp(28px,10vw,48px)] max-w-[clamp(60px,20vw,160px)] w-full truncate outline-none cursor-pointer disabled:opacity-60"
            style={{ color: "inherit" }}
            value={activeIdx >= 0 ? activeIdx : "current"}
            onChange={handleDeviceChange}
            disabled={switching || choices.length === 0}
            title={activeIdx >= 0 ? choices[activeIdx].display : activeDevice || `No device on ${label}`}
          >
            {activeIdx < 0 && (
              <option value="current" disabled>
                {activeDevice || "No device"}
              </option>
            )}
            {choices.map((d, i) => (
              <option key={i} value={i}>
                {d.display}
              </option>
            ))}
          </select>
        </div>

        {busMenuOpen && (
          <div className={menuCls}>
            <div className={menuHeaderCls}>Show output</div>
            {Array.from({ length: hwBusCount }, (_, b) => {
              const state = busStates.get(b);
              return (
                <button
                  key={b}
                  className={menuItemCls}
                  onClick={() => {
                    setBusMenuOpen(false);
                    setSwitchError(null);
                    onOutputBusChange(b);
                  }}
                >
                  <span className="flex items-center gap-[clamp(3px,0.8vw,6px)] min-w-0">
                    <span className={`font-bold shrink-0 ${b === outputBus ? "text-white" : ""}`}>
                      {b === outputBus ? "● " : ""}
                      {busLabel(b)}
                    </span>
                    <span className="truncate text-white/45">{state?.device || "No device"}</span>
                  </span>
                  {state?.muted && <SpeakerIcon muted className="w-[11px] h-[11px] shrink-0 text-red-400" />}
                </button>
              );
            })}
            <div className="px-2 pt-1 text-[clamp(0.45rem,1.3vw,0.6rem)] text-white/35 whitespace-nowrap">
              Devices per output: Settings → Outputs
            </div>
          </div>
        )}
      </div>

      {/* Window controls — never squeezed; the picker gives way instead */}
      <div className="flex items-center gap-[2px] shrink-0">
        {/* Minimize — right-click opens the window-size presets */}
        <div className="relative" ref={presetMenuRef}>
          <button
            className="w-[clamp(18px,4vw,28px)] h-[clamp(16px,4dvh,28px)] flex items-center justify-center rounded-[3px] border-none cursor-pointer text-[clamp(0.5rem,1.5vw,0.7rem)] hover:bg-white/20"
            style={{ color: "var(--titlebar-fg)", backgroundColor: "transparent" }}
            onClick={() => appWindow.minimize()}
            onContextMenu={(e) => {
              e.preventDefault();
              setPresetMenuOpen((v) => !v);
            }}
            title="Minimize (right-click for window sizes)"
          >
            ─
          </button>

          {presetMenuOpen && (
            <div className={menuCls}>
              <div className={menuHeaderCls}>Window size</div>
              {windowPresets.length === 0 ? (
                <div className="px-2 py-1 text-[clamp(0.5rem,1.5vw,0.65rem)] text-white/40">
                  None — add some in Settings
                </div>
              ) : (
                windowPresets.map((preset, i) => (
                  <button
                    key={`${preset.name}-${i}`}
                    className={menuItemCls}
                    onClick={() => applyPreset(preset)}
                  >
                    <span className="truncate">{preset.name}</span>
                    <span className="tabular-nums text-white/40 shrink-0">
                      {preset.width}x{preset.height}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        <button
          className="w-[clamp(18px,4vw,28px)] h-[clamp(16px,4dvh,28px)] flex items-center justify-center rounded-[3px] border-none cursor-pointer text-[clamp(0.5rem,1.5vw,0.7rem)] hover:bg-red-500/80"
          style={{ color: "var(--titlebar-fg)", backgroundColor: "transparent" }}
          onClick={() => appWindow.close()}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

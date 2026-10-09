import { useState, useEffect, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { A1Device } from "./config";
import { useVoicemeeter } from "./hooks/useVoicemeeter";
import { useAccentColor } from "./hooks/useAccentColor";
import { useChannelConfig } from "./hooks/useChannelConfig";
import { useStyleSettings } from "./hooks/useStyleSettings";
import { useWindowFocus } from "./hooks/useWindowFocus";
import { useGlobalShortcuts } from "./hooks/useGlobalShortcuts";
import { useEditionInfo } from "./hooks/useEditionInfo";
import { useFxGroups } from "./hooks/useFxGroups";
import type { StyleSettings, UnfocusedVisualizerMode } from "./types/style";
import Titlebar from "./components/Titlebar";
import Fader from "./components/Fader";
import BackgroundLayer from "./components/BackgroundLayer";
import { visualizerLevel } from "./lib/visualizerLevel";
import { hexToRgb } from "./lib/color";
import { useSpectrum } from "./hooks/useSpectrum";
import { usesSpectrum } from "./lib/visualizerPresets";
import SettingsPanel from "./components/SettingsPanel";
import ConnectionOverlay from "./components/ConnectionOverlay";
import FxBar from "./components/FxBar";
import AppMixerPanel from "./components/AppMixerPanel";

/** Frame rate to run at: the setting, or a lower unfocused cap (never higher). */
function unfocusedFps(fps: number, mode: UnfocusedVisualizerMode, focused: boolean): number {
  if (focused || mode === "animated" || mode === "paused") return fps;
  return Math.min(fps, Number(mode));
}

export default function App() {
  const { style, saveStyle, loaded: styleLoaded } = useStyleSettings();
  const focused = useWindowFocus();

  // Live preview style when settings panel is open
  const [previewStyle, setPreviewStyle] = useState<StyleSettings | null>(null);
  const effectiveSettings = previewStyle ?? style;
  const bg = effectiveSettings.background;

  useAccentColor(
    effectiveSettings.accentSource,
    effectiveSettings.customAccentColor,
  );

  // Visualizer colors, published as inline CSS vars the visualizers read each
  // frame: --viz-r/g/b is the main color, --viz-palette lists every color as
  // "r,g,b|r,g,b" (empty unless a palette is chosen). Not ";": that ends a CSS
  // declaration, so the browser silently drops the whole value.
  useEffect(() => {
    const root = document.documentElement;
    let main: string;
    let palette = "";
    if (bg.visualizerColorSource === "custom") {
      main = hexToRgb(bg.visualizerColor).join(",");
    } else if (bg.visualizerColorSource === "palette") {
      const colors = bg.visualizerPalette.map((c) => hexToRgb(c).join(","));
      main = colors[0];
      palette = colors.join("|");
    } else {
      const css = getComputedStyle(root);
      main = ["--accent-r", "--accent-g", "--accent-b"].map((v) => css.getPropertyValue(v).trim()).join(",");
    }
    const [r, g, b] = main.split(",");
    root.style.setProperty("--viz-r", r);
    root.style.setProperty("--viz-g", g);
    root.style.setProperty("--viz-b", b);
    root.style.setProperty("--viz-palette", palette);
  }, [bg.visualizerColorSource, bg.visualizerColor, bg.visualizerPalette, effectiveSettings.accentSource, effectiveSettings.customAccentColor]);

  // Fader glass: one setting drives the panel's tint and its backdrop blur,
  // read by every Fader through CSS vars. At 0 there is no blur at all, so it
  // costs nothing.
  useEffect(() => {
    const glass = Math.min(1, Math.max(0, effectiveSettings.faderGlass ?? 1));
    const root = document.documentElement.style;
    root.setProperty("--fader-glass-tint", String(0.8 * glass));
    root.setProperty(
      "--fader-glass-filter",
      glass > 0 ? `blur(${(12 * glass).toFixed(1)}px) saturate(${(1 + 0.5 * glass).toFixed(2)})` : "none",
    );
  }, [effectiveSettings.faderGlass]);

  // Compute background layer props — focus only affects visualizer pause
  const bgProps = useMemo(() => {
    const isAcrylic = bg.backgroundMode === "acrylic";
    const vizPaused = !focused && bg.unfocusedVisualizerMode === "paused";

    return {
      isAcrylic,
      showColor: bg.backgroundMode === "solid",
      color: bg.backgroundColor,
      colorOpacity: bg.backgroundOpacity,
      showVisualizer: bg.backgroundMode === "visualizer",
      visualizerPaused: vizPaused,
      visualizerPreset: bg.visualizerPreset,
      visualizerOpacity: bg.visualizerOpacity,
      visualizerIntensity: bg.visualizerIntensity,
      visualizerSpeed: bg.visualizerSpeed,
      visualizerFps: unfocusedFps(bg.visualizerFps, bg.unfocusedVisualizerMode, focused),
      visualizerFilters: bg.visualizerFilters,
      visualizerCelEdges: bg.visualizerCelEdges,
      terrainMaterial: bg.terrainMaterial,
      terrainPattern: bg.terrainPattern,
    };
  }, [bg, focused]);

  // Acrylic + CSS overlay, synced to focus state.
  // Windows DWM forces acrylic opaque when unfocused, so we clear it and
  // fall back to a CSS-only translucent overlay that preserves the look.
  useEffect(() => {
    if (!styleLoaded) return;
    if (bgProps.isAcrylic) {
      if (focused) {
        invoke("set_acrylic", { enabled: true }).catch(() => {});
        document.documentElement.style.setProperty("--glass-opacity", "0.45");
      } else {
        document.documentElement.style.setProperty("--glass-opacity", "0.85");
        invoke("set_acrylic", { enabled: false }).catch(() => {});
      }
    } else {
      invoke("set_acrylic", { enabled: false }).catch(() => {});
      document.documentElement.style.setProperty("--glass-opacity", "0.85");
    }
  }, [bgProps.isAcrylic, focused, styleLoaded]);

  // Keep the OS always-on-top flag in sync with the saved preference. Reads from
  // `style` rather than `effectiveSettings` so live style previews can't unpin the
  // window as a side effect.
  useEffect(() => {
    if (!styleLoaded) return;
    getCurrentWindow().setAlwaysOnTop(style.alwaysOnTop).catch(() => {});
  }, [style.alwaysOnTop, styleLoaded]);

  const togglePinned = () => {
    saveStyle({ ...style, alwaysOnTop: !style.alwaysOnTop });
  };

  // Whole-window opacity. Uses effectiveSettings so dragging the slider in
  // Settings previews live, unlike the pin which must not follow previews.
  useEffect(() => {
    if (!styleLoaded) return;
    invoke("set_window_opacity", { opacity: effectiveSettings.globalOpacity ?? 1 }).catch(() => {});
  }, [effectiveSettings.globalOpacity, styleLoaded]);

  const { channels: channelConfigs, saveChannels, outputs, saveOutputs, meterDecay, saveMeterDecay, loaded, needsOutputSetup, setNeedsOutputSetup } = useChannelConfig();
  const {
    connection,
    connected,
    everConnected,
    liveEdition,
    error,
    channels,
    levels,
    preFaderLevels,
    busGains,
    setGain,
    setMute,
    startDragging,
    stopDragging,
    launchVoicemeeter,
  } = useVoicemeeter(channelConfigs);

  // Which Voicemeeter to lay strips out for: live while connected, else last seen.
  const { edition, isLive: editionIsLive, launchEdition, saveLaunchEdition } =
    useEditionInfo(liveEdition);

  // A drop after we've been live (engine restart, device switch) is transient —
  // show it in the titlebar rather than blanking the window.
  const reconnecting = everConnected && connection !== "connected";
  const [selectedA1, setSelectedA1] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appsOpen, setAppsOpen] = useState(false);

  // Auto-detect A1 output device on first run
  const autoDetectRan = useRef(false);
  useEffect(() => {
    if (!connected || !needsOutputSetup || autoDetectRan.current) return;
    autoDetectRan.current = true;
    (async () => {
      try {
        const device = await invoke<A1Device | null>("vm_get_a1_device");
        if (device) {
          saveOutputs([device]);
          setNeedsOutputSetup(false);
        }
      } catch {
        // Non-critical — user can configure manually
      }
    })();
  }, [connected, needsOutputSetup, saveOutputs, setNeedsOutputSetup]);

  // FX preset groups: persisted here, toggled and tracked in Rust.
  const { groups: fxGroups, active: activeFx, saveFxGroups, toggleGroup: toggleFxGroup } =
    useFxGroups(connected);

  // Sync every hotkey (mutes + FX groups) to Rust — shortcuts are handled entirely there
  useGlobalShortcuts(channelConfigs, fxGroups);

  // Real frequency data, captured only while a visualizer that uses it is on
  // screen and animating (see hooks/useSpectrum).
  const spectrum = useSpectrum(
    bgProps.showVisualizer && !bgProps.visualizerPaused && usesSpectrum(bgProps.visualizerPreset),
  );

  // Level for the visualizers: loudest pre-fader source (see lib/visualizerLevel)
  const masterLevel = useMemo(
    () => visualizerLevel(preFaderLevels, channels),
    [preFaderLevels, channels],
  );

  // Fader width CSS var
  const faderWidth = effectiveSettings.faderColumnWidth;
  const faderContainerStyle = faderWidth > 0
    ? { "--fader-max-w": `${faderWidth}px` } as React.CSSProperties
    : undefined;

  return (
    <div className="flex flex-col h-dvh w-dvw overflow-hidden rounded-[6px] relative isolate">
      {/* Background layer — behind all content */}
      <BackgroundLayer
        showColor={bgProps.showColor}
        color={bgProps.color}
        colorOpacity={bgProps.colorOpacity}
        showVisualizer={bgProps.showVisualizer}
        visualizerPaused={bgProps.visualizerPaused}
        visualizerPreset={bgProps.visualizerPreset}
        visualizerOpacity={bgProps.visualizerOpacity}
        visualizerIntensity={bgProps.visualizerIntensity}
        visualizerSpeed={bgProps.visualizerSpeed}
        visualizerFps={bgProps.visualizerFps}
        visualizerFilters={bgProps.visualizerFilters}
        visualizerCelEdges={bgProps.visualizerCelEdges}
        terrainMaterial={bgProps.terrainMaterial}
        terrainPattern={bgProps.terrainPattern}
        masterLevel={masterLevel}
        spectrum={spectrum}
      />

      {/* Glass overlay — rendered via CSS on #root > div */}

      <Titlebar
        selectedA1={selectedA1}
        a1Choices={outputs}
        onA1Change={setSelectedA1}
        onSettingsClick={() => {
          setAppsOpen(false);
          setSettingsOpen(true);
        }}
        onAppsClick={() => setAppsOpen((v) => !v)}
        appsOpen={appsOpen}
        busGain={busGains.get(0) ?? 0}
        showOutputLevel={effectiveSettings.showOutputLevel}
        reconnecting={reconnecting}
        pinned={style.alwaysOnTop}
        onPinToggle={togglePinned}
        windowPresets={effectiveSettings.windowPresets ?? []}
        titlebarStyle={effectiveSettings.titlebarStyle}
      />

      {/* Channel faders */}
      <div
        className="flex-1 flex items-stretch px-[clamp(6px,2vw,16px)] pt-[clamp(4px,1.5dvh,12px)] pb-[clamp(4px,1dvh,8px)] gap-[clamp(4px,1.5vw,16px)] min-h-0"
        style={faderContainerStyle}
      >
        {loaded &&
          channelConfigs.map((ch) => {
            const state = channels.get(ch.strip) ?? {
              gain: ch.defaultDb,
              muted: false,
            };
            return (
              <Fader
                key={ch.strip}
                label={ch.label}
                value={state.gain}
                min={ch.minDb}
                max={ch.maxDb}
                hasMute={ch.hasMute}
                muted={state.muted}
                level={levels.get(ch.strip) ?? 0}
                levelScale={ch.levelScale ?? 1}
                meterDecay={meterDecay}
                onChange={(v) => setGain(ch.strip, v)}
                onMuteToggle={(m) => setMute(ch.strip, m)}
                onDragStart={() => startDragging(ch.strip)}
                onDragEnd={() => stopDragging(ch.strip)}
                defaultDb={ch.defaultDb}
              />
            );
          })}
      </div>

      {/* Bottom accent bar — grows to show FX pills while groups are active */}
      <FxBar groups={fxGroups} active={activeFx} onToggle={toggleFxGroup} />

      {/* Per-app mixer slide-over */}
      <AppMixerPanel
        open={appsOpen}
        onClose={() => setAppsOpen(false)}
        channels={channelConfigs}
        edition={edition}
        connected={connected}
      />

      {/* Settings panel */}
      <SettingsPanel
        open={settingsOpen}
        channels={channelConfigs}
        outputs={outputs}
        meterDecay={meterDecay}
        styleSettings={style}
        fxGroups={fxGroups}
        activeFx={activeFx}
        onToggleFx={toggleFxGroup}
        connected={connected}
        edition={edition}
        editionIsLive={editionIsLive}
        launchEdition={launchEdition}
        onLaunchEditionChange={saveLaunchEdition}
        onSaveChannels={saveChannels}
        onSaveOutputs={saveOutputs}
        onSaveMeterDecay={saveMeterDecay}
        onSaveStyle={saveStyle}
        onSaveFxGroups={saveFxGroups}
        onPreviewStyle={setPreviewStyle}
        onClose={() => setSettingsOpen(false)}
      />

      {/* Cold-start gate — only until the first successful connection */}
      {!everConnected && !connected && (
        <ConnectionOverlay
          connection={connection}
          error={error}
          launchEdition={launchEdition}
          onLaunchEditionChange={saveLaunchEdition}
          onLaunch={launchVoicemeeter}
        />
      )}
    </div>
  );
}

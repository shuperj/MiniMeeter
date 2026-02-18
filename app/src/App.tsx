import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useVoicemeeter } from "./hooks/useVoicemeeter";
import { useAccentColor } from "./hooks/useAccentColor";
import { useChannelConfig } from "./hooks/useChannelConfig";
import { useStyleSettings } from "./hooks/useStyleSettings";
import { useWindowFocus } from "./hooks/useWindowFocus";
import type { StyleSettings } from "./types/style";
import Titlebar from "./components/Titlebar";
import Fader from "./components/Fader";
import BackgroundLayer from "./components/BackgroundLayer";
import SettingsPanel from "./components/SettingsPanel";

export default function App() {
  const { style, saveStyle, loaded: styleLoaded } = useStyleSettings();
  const focused = useWindowFocus();

  // Live preview style when settings panel is open
  const [previewStyle, setPreviewStyle] = useState<StyleSettings | null>(null);
  const effectiveSettings = previewStyle ?? style;
  const effectiveStyle = focused
    ? effectiveSettings.focused
    : effectiveSettings.unfocused;

  useAccentColor(
    effectiveSettings.accentSource,
    effectiveSettings.customAccentColor,
  );

  // Determine if styles are the same (same-as-focused mode)
  const sameStyles = useMemo(
    () => JSON.stringify(effectiveSettings.focused) === JSON.stringify(effectiveSettings.unfocused),
    [effectiveSettings.focused, effectiveSettings.unfocused],
  );

  // Compute background layer props
  const bgProps = useMemo(() => {
    const isAcrylic = effectiveStyle.backgroundMode === "acrylic";
    const isFocusedOrSame = focused || sameStyles;

    if (isFocusedOrSame) {
      // Focused or same-as-focused: use effectiveStyle directly
      return {
        isAcrylic,
        acrylicOpacity: effectiveStyle.acrylicOpacity,
        acrylicBlur: effectiveStyle.acrylicBlur,
        showColor: effectiveStyle.backgroundMode === "solid",
        color: effectiveStyle.backgroundColor,
        colorOpacity: effectiveStyle.backgroundOpacity,
        showVisualizer: effectiveStyle.backgroundMode === "visualizer",
        visualizerPaused: false,
        visualizerPreset: effectiveStyle.visualizerPreset,
        visualizerOpacity: effectiveStyle.visualizerOpacity,
        visualizerIntensity: effectiveStyle.visualizerIntensity,
      };
    }

    // Unfocused with different settings
    // Only allow visualizer carry-over if focused mode is actually "visualizer"
    const vizMode = effectiveSettings.unfocusedVisualizerMode;
    const focusedUsesViz = effectiveSettings.focused.backgroundMode === "visualizer";
    const showVisualizer = focusedUsesViz && vizMode !== "off";

    return {
      isAcrylic,
      acrylicOpacity: effectiveStyle.acrylicOpacity,
      acrylicBlur: effectiveStyle.acrylicBlur,
      showColor: effectiveStyle.backgroundMode === "solid",
      color: effectiveStyle.backgroundColor,
      colorOpacity: effectiveStyle.backgroundOpacity,
      showVisualizer,
      visualizerPaused: vizMode === "paused",
      // Use focused preset/opacity/intensity for unfocused visualizer
      visualizerPreset: effectiveSettings.focused.visualizerPreset,
      visualizerOpacity: effectiveSettings.focused.visualizerOpacity,
      visualizerIntensity: effectiveSettings.focused.visualizerIntensity,
    };
  }, [effectiveStyle, effectiveSettings, focused, sameStyles]);

  // Toggle acrylic on focus / style changes, passing tint alpha from blur slider
  useEffect(() => {
    if (!styleLoaded) return;
    // Map blur 0-1 to tint alpha: high blur → low tint alpha (more transparent tint, more blur visible)
    const tintAlpha = bgProps.isAcrylic
      ? Math.round(255 * (1 - bgProps.acrylicBlur * 0.85))
      : undefined;
    invoke("set_acrylic", { enabled: bgProps.isAcrylic, tintAlpha }).catch(() => {});
  }, [bgProps.isAcrylic, bgProps.acrylicBlur, styleLoaded]);

  // Set glass overlay opacity based on acrylic state
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--glass-opacity",
      bgProps.isAcrylic ? String(bgProps.acrylicOpacity) : "0.85",
    );
  }, [bgProps.isAcrylic, bgProps.acrylicOpacity]);

  const { channels: channelConfigs, saveChannels, outputs, saveOutputs, meterDecay, saveMeterDecay, loaded } = useChannelConfig();
  const { connected, error, channels, levels, setGain, setMute, startDragging, stopDragging } =
    useVoicemeeter(channelConfigs);
  const [selectedA1, setSelectedA1] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Master level for visualizers: max of all strip levels
  const masterLevel = useMemo(() => {
    let max = 0;
    for (const v of levels.values()) {
      if (v > max) max = v;
    }
    return max;
  }, [levels]);

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
        masterLevel={masterLevel}
      />

      {/* Glass overlay — rendered via CSS on #root > div */}

      <Titlebar
        selectedA1={selectedA1}
        a1Choices={outputs}
        onA1Change={setSelectedA1}
        onSettingsClick={() => setSettingsOpen(true)}
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
              />
            );
          })}
      </div>

      {/* Bottom accent bar */}
      <div
        className="h-[clamp(2px,0.5dvh,4px)] shrink-0"
        style={{ backgroundColor: "var(--accent)" }}
      />

      {/* Settings panel */}
      <SettingsPanel
        open={settingsOpen}
        channels={channelConfigs}
        outputs={outputs}
        meterDecay={meterDecay}
        styleSettings={style}
        onSaveChannels={saveChannels}
        onSaveOutputs={saveOutputs}
        onSaveMeterDecay={saveMeterDecay}
        onSaveStyle={saveStyle}
        onPreviewStyle={setPreviewStyle}
        onClose={() => setSettingsOpen(false)}
      />

      {/* Connection error overlay */}
      {error && !connected && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 rounded-[6px] p-4">
          <div className="text-center text-white/90 text-[clamp(0.6rem,2vw,0.85rem)]">
            <p className="font-bold mb-2">Connection Failed</p>
            <p className="text-white/60 text-[clamp(0.5rem,1.5vw,0.7rem)]">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}

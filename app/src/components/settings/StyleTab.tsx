import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  enable as autostartEnable,
  disable as autostartDisable,
  isEnabled as autostartIsEnabled,
} from "@tauri-apps/plugin-autostart";
import type { AccentSource, StyleSettings, TitlebarStyle, WindowPreset } from "../../types/style";
import { DEFAULT_STYLE_SETTINGS } from "../../types/style";
import WindowStateStyleEditor from "./WindowStateStyleEditor";
import SettingsGroup, { SettingRow, Segmented } from "./SettingsGroup";
import { sectionCls, sliderCls, sliderValueCls, swatchCls } from "./shared";

interface StyleTabProps {
  draft: StyleSettings;
  onChange: (next: StyleSettings) => void;
  meterDecay: number;
  onMeterDecayChange: (decay: number) => void;
  smallText: string;
  medText: string;
  inputCls: string;
}

const TITLEBAR_STYLES: { value: TitlebarStyle; label: string }[] = [
  { value: "solid", label: "Solid" },
  { value: "mica", label: "Mica" },
  { value: "clear", label: "Clear" },
];

const ACCENT_SOURCES: { value: AccentSource; label: string }[] = [
  { value: "system", label: "System" },
  { value: "custom", label: "Custom" },
];

const checkboxLabelCls = "flex items-center gap-1 cursor-pointer select-none";
const checkboxCls = "accent-[var(--accent)] cursor-pointer";

export default function StyleTab({
  draft,
  onChange,
  meterDecay,
  onMeterDecayChange,
  smallText,
  inputCls,
}: StyleTabProps) {
  const update = (patch: Partial<StyleSettings>) => {
    onChange({ ...draft, ...patch });
  };

  // Launch-on-startup is an OS registration, not a saved setting, so it
  // applies immediately rather than on Save.
  const [autostartEnabled, setAutostartEnabled] = useState(false);
  useEffect(() => {
    autostartIsEnabled().then(setAutostartEnabled).catch(() => setAutostartEnabled(false));
  }, []);
  const handleAutostartToggle = async (checked: boolean) => {
    setAutostartEnabled(checked);
    try {
      if (checked) await autostartEnable();
      else await autostartDisable();
    } catch {
      setAutostartEnabled(!checked);
    }
  };

  const presets: WindowPreset[] = draft.windowPresets ?? [];

  const updatePreset = (idx: number, patch: Partial<WindowPreset>) => {
    update({ windowPresets: presets.map((p, i) => (i === idx ? { ...p, ...patch } : p)) });
  };

  const removePreset = (idx: number) => {
    update({ windowPresets: presets.filter((_, i) => i !== idx) });
  };

  const addPreset = () => {
    update({ windowPresets: [...presets, { name: "New size", width: 420, height: 340 }] });
  };

  /** Snap a preset to whatever size the window is right now — far easier than
   *  guessing pixel values by hand. */
  const captureCurrentSize = async (idx: number) => {
    try {
      const win = getCurrentWindow();
      const [size, scale] = await Promise.all([win.innerSize(), win.scaleFactor()]);
      const logical = size.toLogical(scale);
      updatePreset(idx, {
        width: Math.round(logical.width),
        height: Math.round(logical.height),
      });
    } catch {
      // Leave the preset untouched if the window won't report its size.
    }
  };

  return (
    <div className="flex flex-col gap-[clamp(6px,1.2dvh,10px)]">
      {/* Accent color — always visible, it tints everything below */}
      <div className={sectionCls}>
        <SettingRow label="Accent color">
          <Segmented
            options={ACCENT_SOURCES}
            value={draft.accentSource}
            onChange={(accentSource) => update({ accentSource })}
          />
          {draft.accentSource === "custom" && (
            <>
              <input
                type="color"
                value={draft.customAccentColor}
                onChange={(e) => update({ customAccentColor: e.target.value })}
                className={swatchCls}
              />
              <span className="tabular-nums">{draft.customAccentColor}</span>
            </>
          )}
        </SettingRow>
      </div>

      <SettingsGroup title="Background" defaultOpen storageKey="minimeeter.styleTab.background.open">
        <WindowStateStyleEditor
          draft={draft.background}
          onChange={(background) => update({ background })}
          smallText={smallText}
          inputCls={inputCls}
        />
      </SettingsGroup>

      <SettingsGroup title="Faders" storageKey="minimeeter.styleTab.faders.open">
        <SettingRow label="Width">
          <label className={checkboxLabelCls}>
            <input
              type="checkbox"
              checked={draft.faderColumnWidth === 0}
              onChange={(e) => update({ faderColumnWidth: e.target.checked ? 0 : 60 })}
              className={checkboxCls}
            />
            Auto
          </label>
          {draft.faderColumnWidth > 0 && (
            <>
              <input
                type="range"
                min="42"
                max="120"
                step="1"
                value={draft.faderColumnWidth}
                onChange={(e) => update({ faderColumnWidth: Number(e.target.value) })}
                className={sliderCls}
              />
              <span className="tabular-nums w-[5ch] text-right shrink-0">{draft.faderColumnWidth}px</span>
            </>
          )}
        </SettingRow>

        <SettingRow
          label="Glass"
          hint="Frosted glass behind the faders. Lower it to let the background show through more clearly."
        >
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={draft.faderGlass ?? 1}
            onChange={(e) => update({ faderGlass: Number(e.target.value) })}
            onDoubleClick={() => update({ faderGlass: 1 })}
            className={sliderCls}
          />
          <span className={sliderValueCls}>{Math.round((draft.faderGlass ?? 1) * 100)}%</span>
        </SettingRow>

        <SettingRow label="Meter decay">
          <input
            type="range"
            min="0.05"
            max="2"
            step="0.05"
            value={meterDecay}
            onChange={(e) => onMeterDecayChange(Number(e.target.value))}
            onDoubleClick={() => onMeterDecayChange(0.3)}
            className={sliderCls}
          />
          <span className={sliderValueCls}>
            {meterDecay < 0.15 ? "Slow" : meterDecay > 1.5 ? "Fast" : meterDecay.toFixed(2)}
          </span>
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title="Window" storageKey="minimeeter.styleTab.window.open">
        <SettingRow
          label="Opacity"
          hint="Fades the whole window. The visualizer slider only affects the animation."
        >
          <input
            type="range"
            min="0.2"
            max="1"
            step="0.01"
            value={draft.globalOpacity ?? 1}
            onChange={(e) => update({ globalOpacity: Number(e.target.value) })}
            onDoubleClick={() => update({ globalOpacity: 1 })}
            className={sliderCls}
          />
          <span className={sliderValueCls}>{Math.round((draft.globalOpacity ?? 1) * 100)}%</span>
        </SettingRow>

        <SettingRow label="Titlebar" title="Solid fills the bar with the accent; Mica is frosted glass tinted with the accent; Clear is frosted glass with no tint.">
          <Segmented
            options={TITLEBAR_STYLES}
            value={draft.titlebarStyle}
            onChange={(titlebarStyle) => update({ titlebarStyle })}
          />
          <label className={checkboxLabelCls}>
            <input
              type="checkbox"
              checked={draft.showOutputLevel}
              onChange={(e) => update({ showOutputLevel: e.target.checked })}
              className={checkboxCls}
            />
            Show A1 output level
          </label>
        </SettingRow>

        <SettingRow label="Sizes" alignTop hint="Right-click the minimize button to switch between these.">
          <div className="w-full flex flex-col gap-[clamp(2px,0.5dvh,4px)]">
            {presets.map((preset, idx) => (
              <div key={idx} className="flex flex-wrap items-center gap-[clamp(3px,0.8vw,6px)]">
                <input
                  className={`${inputCls} ${smallText} px-[clamp(3px,0.5vw,6px)] py-[1px] w-[clamp(56px,14vw,96px)]`}
                  value={preset.name}
                  onChange={(e) => updatePreset(idx, { name: e.target.value })}
                  placeholder="Name"
                />
                <input
                  type="number"
                  min="200"
                  className={`${inputCls} ${smallText} px-1 py-[1px] w-[clamp(34px,8vw,52px)] text-center`}
                  value={preset.width}
                  onChange={(e) => updatePreset(idx, { width: Number(e.target.value) })}
                />
                <span className="text-white/40">x</span>
                <input
                  type="number"
                  min="275"
                  className={`${inputCls} ${smallText} px-1 py-[1px] w-[clamp(34px,8vw,52px)] text-center`}
                  value={preset.height}
                  onChange={(e) => updatePreset(idx, { height: Number(e.target.value) })}
                />
                <button
                  className={`${inputCls} ${smallText} px-[clamp(3px,0.5vw,6px)] py-[1px] cursor-pointer text-white/70`}
                  onClick={() => captureCurrentSize(idx)}
                  title="Set to the window's current size"
                >
                  Use current
                </button>
                <button
                  className="ml-auto text-red-400/70 hover:text-red-400 bg-transparent border-none cursor-pointer text-[clamp(0.6rem,1.8vw,0.8rem)] p-0"
                  onClick={() => removePreset(idx)}
                  title="Remove preset"
                >
                  x
                </button>
              </div>
            ))}
            <button
              className={`flex items-center justify-center gap-1 bg-white/10 hover:bg-white/15 border border-dashed border-white/20 rounded-[4px] ${smallText} text-white/70 py-[clamp(2px,0.5dvh,5px)] cursor-pointer`}
              onClick={addPreset}
            >
              + Add Window Size
            </button>
          </div>
        </SettingRow>

        <SettingRow label="Startup">
          <label className={checkboxLabelCls}>
            <input
              type="checkbox"
              checked={autostartEnabled}
              onChange={(e) => handleAutostartToggle(e.target.checked)}
              className={checkboxCls}
            />
            Launch on startup
          </label>
        </SettingRow>
      </SettingsGroup>

      {/* Reset */}
      <button
        className={`${smallText} text-white/40 hover:text-white/70 bg-transparent border border-white/10 hover:border-white/20 rounded-[3px] py-[clamp(2px,0.4dvh,4px)] cursor-pointer shrink-0`}
        onClick={() => onChange({ ...DEFAULT_STYLE_SETTINGS })}
      >
        Reset to defaults
      </button>
    </div>
  );
}

import type { StyleSettings } from "../../types/style";
import { DEFAULT_STYLE_SETTINGS } from "../../types/style";
import WindowStateStyleEditor from "./WindowStateStyleEditor";

interface StyleTabProps {
  draft: StyleSettings;
  onChange: (next: StyleSettings) => void;
  meterDecay: number;
  onMeterDecayChange: (decay: number) => void;
  smallText: string;
  medText: string;
  inputCls: string;
}

export default function StyleTab({
  draft,
  onChange,
  meterDecay,
  onMeterDecayChange,
  smallText,
  medText,
  inputCls,
}: StyleTabProps) {
  const update = (patch: Partial<StyleSettings>) => {
    onChange({ ...draft, ...patch });
  };

  return (
    <div className="flex flex-col gap-[clamp(6px,1.2dvh,10px)]">
      {/* Accent color */}
      <div className="bg-white/5 rounded-[4px] p-[clamp(4px,1vw,8px)] flex flex-col gap-[clamp(2px,0.5dvh,4px)]">
        <span className={`${medText} font-semibold text-white/80`}>Accent Color</span>
        <div className={`flex items-center gap-[clamp(4px,0.8vw,8px)] ${smallText} text-white/60 pl-[clamp(6px,1.5vw,12px)]`}>
          <label className="flex items-center gap-1 cursor-pointer select-none">
            <input
              type="radio"
              name="accent"
              checked={draft.accentSource === "system"}
              onChange={() => update({ accentSource: "system" })}
              className="accent-[var(--accent)] cursor-pointer"
            />
            System
          </label>
          <label className="flex items-center gap-1 cursor-pointer select-none">
            <input
              type="radio"
              name="accent"
              checked={draft.accentSource === "custom"}
              onChange={() => update({ accentSource: "custom" })}
              className="accent-[var(--accent)] cursor-pointer"
            />
            Custom
          </label>
          {draft.accentSource === "custom" && (
            <>
              <input
                type="color"
                value={draft.customAccentColor}
                onChange={(e) => update({ customAccentColor: e.target.value })}
                className="w-[clamp(20px,4vw,28px)] h-[clamp(16px,3vw,22px)] border border-white/20 rounded-[2px] cursor-pointer bg-transparent p-0"
              />
              <span className="tabular-nums">{draft.customAccentColor}</span>
            </>
          )}
        </div>
      </div>

      {/* Meter decay */}
      <div className="bg-white/5 rounded-[4px] p-[clamp(4px,1vw,8px)] flex flex-col gap-[clamp(2px,0.5dvh,4px)]">
        <span className={`${medText} font-semibold text-white/80`}>Meter Decay</span>
        <div className={`flex items-center gap-[clamp(4px,1vw,8px)] ${smallText} text-white/60 pl-[clamp(6px,1.5vw,12px)]`}>
          <input
            type="range"
            min="0.05"
            max="2"
            step="0.05"
            value={meterDecay}
            onChange={(e) => onMeterDecayChange(Number(e.target.value))}
            onDoubleClick={() => onMeterDecayChange(0.3)}
            className="flex-1 min-w-[clamp(40px,10vw,80px)] accent-[var(--accent)] cursor-pointer"
          />
          <span className={`${smallText} text-white/60 tabular-nums w-[4ch] text-right`}>
            {meterDecay < 0.15 ? "Slow" : meterDecay > 1.5 ? "Fast" : meterDecay.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Fader column width */}
      <div className="bg-white/5 rounded-[4px] p-[clamp(4px,1vw,8px)] flex flex-col gap-[clamp(2px,0.5dvh,4px)]">
        <span className={`${medText} font-semibold text-white/80`}>Fader Width</span>
        <div className={`flex items-center gap-1 ${smallText} text-white/60 pl-[clamp(6px,1.5vw,12px)]`}>
          <label className="flex items-center gap-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={draft.faderColumnWidth === 0}
              onChange={(e) => update({ faderColumnWidth: e.target.checked ? 0 : 60 })}
              className="accent-[var(--accent)] cursor-pointer"
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
                className="flex-1 min-w-[clamp(40px,10vw,80px)] accent-[var(--accent)] cursor-pointer"
              />
              <span className="tabular-nums w-[4ch] text-right">{draft.faderColumnWidth}px</span>
            </>
          )}
        </div>
      </div>

      {/* Output level in titlebar */}
      <div className="bg-white/5 rounded-[4px] p-[clamp(4px,1vw,8px)] flex flex-col gap-[clamp(2px,0.5dvh,4px)]">
        <span className={`${medText} font-semibold text-white/80`}>Titlebar</span>
        <div className={`flex items-center gap-1 ${smallText} text-white/60 pl-[clamp(6px,1.5vw,12px)]`}>
          <label className="flex items-center gap-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={draft.showOutputLevel}
              onChange={(e) => update({ showOutputLevel: e.target.checked })}
              className="accent-[var(--accent)] cursor-pointer"
            />
            Show A1 output level
          </label>
        </div>
      </div>

      {/* Background */}
      <div className="bg-white/5 rounded-[4px] p-[clamp(4px,1vw,8px)]">
        <WindowStateStyleEditor
          label="Background"
          draft={draft.background}
          onChange={(background) => update({ background })}
          smallText={smallText}
          medText={medText}
          inputCls={inputCls}
        />
      </div>

      {/* Reset */}
      <button
        className={`${smallText} text-white/40 hover:text-white/70 bg-transparent border border-white/10 hover:border-white/20 rounded-[3px] py-[clamp(2px,0.4dvh,4px)] cursor-pointer`}
        onClick={() => onChange({ ...DEFAULT_STYLE_SETTINGS })}
      >
        Reset to defaults
      </button>
    </div>
  );
}

import { useState } from "react";
import type { StyleSettings, UnfocusedVisualizerMode } from "../../types/style";
import { DEFAULT_STYLE_SETTINGS } from "../../types/style";
import WindowStateStyleEditor from "./WindowStateStyleEditor";

interface StyleTabProps {
  draft: StyleSettings;
  onChange: (next: StyleSettings) => void;
  smallText: string;
  medText: string;
  inputCls: string;
}

const VIZ_BEHAVIORS: { value: UnfocusedVisualizerMode; label: string }[] = [
  { value: "animated", label: "Animated" },
  { value: "paused", label: "Paused" },
  { value: "off", label: "Off" },
];

export default function StyleTab({
  draft,
  onChange,
  smallText,
  medText,
  inputCls,
}: StyleTabProps) {
  const update = (patch: Partial<StyleSettings>) => {
    onChange({ ...draft, ...patch });
  };

  // Track whether unfocused should mirror focused
  const [sameAsFocused, setSameAsFocused] = useState(
    () => JSON.stringify(draft.unfocused) === JSON.stringify(draft.focused),
  );

  const handleFocusedChange = (focused: StyleSettings["focused"]) => {
    if (sameAsFocused) {
      update({ focused, unfocused: { ...focused } });
    } else {
      update({ focused });
    }
  };

  const handleToggleSame = () => {
    if (!sameAsFocused) {
      // Turning ON — sync unfocused to focused
      update({ unfocused: { ...draft.focused } });
    }
    setSameAsFocused(!sameAsFocused);
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

      {/* Focused style */}
      <div className="bg-white/5 rounded-[4px] p-[clamp(4px,1vw,8px)]">
        <WindowStateStyleEditor
          label="Focused"
          draft={draft.focused}
          onChange={handleFocusedChange}
          smallText={smallText}
          medText={medText}
          inputCls={inputCls}
        />
      </div>

      {/* Unfocused style */}
      <div className="bg-white/5 rounded-[4px] p-[clamp(4px,1vw,8px)] flex flex-col gap-[clamp(2px,0.5dvh,4px)]">
        <div className="flex items-center gap-[clamp(6px,1.2vw,12px)]">
          <span className={`${medText} font-semibold text-white/80`}>Unfocused</span>
          {/* Toggle switch */}
          <button
            type="button"
            role="switch"
            aria-checked={sameAsFocused}
            onClick={handleToggleSame}
            className="relative inline-flex items-center shrink-0 cursor-pointer rounded-full transition-colors duration-200"
            style={{
              width: "clamp(28px,5vw,36px)",
              height: "clamp(14px,2.5vw,18px)",
              backgroundColor: sameAsFocused ? "var(--accent)" : "rgba(255,255,255,0.2)",
            }}
          >
            <span
              className="inline-block rounded-full bg-white shadow transition-transform duration-200"
              style={{
                width: "clamp(10px,2vw,14px)",
                height: "clamp(10px,2vw,14px)",
                marginLeft: "2px",
                transform: sameAsFocused ? "translateX(clamp(12px,2.5vw,16px))" : "translateX(0)",
              }}
            />
          </button>
          <span className={`${smallText} text-white/50 select-none`}>
            Same as focused
          </span>
        </div>
        {!sameAsFocused && (
          <div className="flex flex-col gap-[clamp(2px,0.5dvh,4px)]">
            <WindowStateStyleEditor
              label=""
              draft={draft.unfocused}
              onChange={(unfocused) => update({ unfocused })}
              smallText={smallText}
              medText={medText}
              inputCls={inputCls}
              isUnfocused
            />

            {/* Unfocused visualizer behavior — only shown when focused uses visualizer */}
            {draft.focused.backgroundMode === "visualizer" && (
              <div className={`flex items-center gap-[clamp(2px,0.5vw,6px)] ${smallText} text-white/60 pl-[clamp(6px,1.5vw,12px)]`}>
                <span>Visualizer:</span>
                {VIZ_BEHAVIORS.map((b) => (
                  <button
                    key={b.value}
                    className={`px-[clamp(4px,0.8vw,8px)] py-[1px] rounded-[3px] border-none cursor-pointer ${smallText} font-medium`}
                    style={{
                      backgroundColor: draft.unfocusedVisualizerMode === b.value ? "var(--accent)" : "rgba(255,255,255,0.1)",
                      color: draft.unfocusedVisualizerMode === b.value ? "var(--accent-fg)" : "rgba(255,255,255,0.7)",
                    }}
                    onClick={() => update({ unfocusedVisualizerMode: b.value })}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Reset */}
      <button
        className={`${smallText} text-white/40 hover:text-white/70 bg-transparent border border-white/10 hover:border-white/20 rounded-[3px] py-[clamp(2px,0.4dvh,4px)] cursor-pointer`}
        onClick={() => {
          setSameAsFocused(true);
          onChange({ ...DEFAULT_STYLE_SETTINGS });
        }}
      >
        Reset to defaults
      </button>
    </div>
  );
}

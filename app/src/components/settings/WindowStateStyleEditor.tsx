import type { BackgroundStyle, BackgroundMode, VisualizerPreset, VisualizerColorSource, UnfocusedVisualizerMode } from "../../types/style";

interface WindowStateStyleEditorProps {
  label: string;
  draft: BackgroundStyle;
  onChange: (next: BackgroundStyle) => void;
  smallText: string;
  medText: string;
  inputCls: string;
}

const BG_MODES: { value: BackgroundMode; label: string }[] = [
  { value: "solid", label: "Color" },
  { value: "acrylic", label: "Acrylic" },
  { value: "visualizer", label: "Visualizer" },
];

const VISUALIZER_PRESETS: { value: VisualizerPreset; label: string }[] = [
  { value: "xmb-smoke", label: "XMB Smoke" },
  { value: "starfield", label: "Starfield" },
  { value: "matrix-rain", label: "Matrix Rain" },
  { value: "gradient-mesh", label: "Gradient Mesh" },
  { value: "noise-flow", label: "Noise Flow" },
  { value: "geometric-pulse", label: "Geometric Pulse" },
];

const VIZ_COLOR_SOURCES: { value: VisualizerColorSource; label: string }[] = [
  { value: "accent", label: "Accent" },
  { value: "custom", label: "Custom" },
];

const VIZ_UNFOCUSED: { value: UnfocusedVisualizerMode; label: string }[] = [
  { value: "animated", label: "Animated" },
  { value: "paused", label: "Paused" },
];

export default function WindowStateStyleEditor({
  label,
  draft,
  onChange,
  smallText,
  medText,
  inputCls: _inputCls,
}: WindowStateStyleEditorProps) {
  const update = (patch: Partial<BackgroundStyle>) => {
    onChange({ ...draft, ...patch });
  };

  return (
    <div className="flex flex-col gap-[clamp(3px,0.8dvh,6px)]">
      {label && <span className={`${medText} font-semibold text-white/80`}>{label}</span>}

      <div className="flex flex-col gap-[clamp(2px,0.5dvh,4px)] pl-[clamp(6px,1.5vw,12px)]">
        {/* Background mode */}
        <div className={`flex items-center gap-[clamp(2px,0.5vw,6px)] ${smallText} text-white/60`}>
          <span>Mode:</span>
          {BG_MODES.map((m) => (
            <button
              key={m.value}
              className={`px-[clamp(4px,0.8vw,8px)] py-[1px] rounded-[3px] border-none cursor-pointer ${smallText} font-medium`}
              style={{
                backgroundColor: draft.backgroundMode === m.value ? "var(--accent)" : "rgba(255,255,255,0.1)",
                color: draft.backgroundMode === m.value ? "var(--accent-fg)" : "rgba(255,255,255,0.7)",
              }}
              onClick={() => update({ backgroundMode: m.value })}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Solid color picker + opacity */}
        {draft.backgroundMode === "solid" && (
          <div className="flex flex-col gap-[clamp(2px,0.4dvh,4px)]">
            <div className={`flex items-center gap-1 ${smallText} text-white/60`}>
              <span>Color:</span>
              <input
                type="color"
                value={draft.backgroundColor}
                onChange={(e) => update({ backgroundColor: e.target.value })}
                className="w-[clamp(20px,4vw,28px)] h-[clamp(16px,3vw,22px)] border border-white/20 rounded-[2px] cursor-pointer bg-transparent p-0"
              />
              <span className="tabular-nums">{draft.backgroundColor}</span>
            </div>
            <div className={`flex items-center gap-1 ${smallText} text-white/60`}>
              <span>Opacity:</span>
              <input
                type="range"
                min="0.05"
                max="1"
                step="0.05"
                value={draft.backgroundOpacity}
                onChange={(e) => update({ backgroundOpacity: Number(e.target.value) })}
                className="flex-1 accent-[var(--accent)] cursor-pointer"
              />
              <span className="tabular-nums w-[3ch] text-right">
                {Math.round(draft.backgroundOpacity * 100)}%
              </span>
            </div>
          </div>
        )}

        {/* Visualizer settings */}
        {draft.backgroundMode === "visualizer" && (
          <div className="flex flex-col gap-[clamp(2px,0.4dvh,4px)]">
            <div className={`flex items-center gap-1 ${smallText} text-white/60`}>
              <span>Preset:</span>
              <select
                className={`bg-white/10 border border-white/20 rounded-[3px] text-white/90 outline-none focus:border-[var(--accent)] ${smallText} px-[clamp(2px,0.3vw,4px)] py-[2px] cursor-pointer`}
                style={{ colorScheme: "dark" }}
                value={draft.visualizerPreset}
                onChange={(e) => update({ visualizerPreset: e.target.value as VisualizerPreset })}
              >
                {VISUALIZER_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div className={`flex items-center gap-1 ${smallText} text-white/60`}>
              <span>Opacity:</span>
              <input
                type="range"
                min="0.05"
                max="1"
                step="0.05"
                value={draft.visualizerOpacity}
                onChange={(e) => update({ visualizerOpacity: Number(e.target.value) })}
                className="flex-1 accent-[var(--accent)] cursor-pointer"
              />
              <span className="tabular-nums w-[3ch] text-right">
                {Math.round(draft.visualizerOpacity * 100)}%
              </span>
            </div>
            <div className={`flex items-center gap-1 ${smallText} text-white/60`}>
              <span>Reactivity:</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={draft.visualizerIntensity}
                onChange={(e) => update({ visualizerIntensity: Number(e.target.value) })}
                className="flex-1 accent-[var(--accent)] cursor-pointer"
              />
              <span className="tabular-nums w-[3ch] text-right">
                {Math.round(draft.visualizerIntensity * 100)}%
              </span>
            </div>
            <div className={`flex items-center gap-[clamp(2px,0.5vw,6px)] ${smallText} text-white/60`}>
              <span>Color:</span>
              {VIZ_COLOR_SOURCES.map((s) => (
                <button
                  key={s.value}
                  className={`px-[clamp(4px,0.8vw,8px)] py-[1px] rounded-[3px] border-none cursor-pointer ${smallText} font-medium`}
                  style={{
                    backgroundColor: draft.visualizerColorSource === s.value ? "var(--accent)" : "rgba(255,255,255,0.1)",
                    color: draft.visualizerColorSource === s.value ? "var(--accent-fg)" : "rgba(255,255,255,0.7)",
                  }}
                  onClick={() => update({ visualizerColorSource: s.value })}
                >
                  {s.label}
                </button>
              ))}
              {draft.visualizerColorSource === "custom" && (
                <>
                  <input
                    type="color"
                    value={draft.visualizerColor}
                    onChange={(e) => update({ visualizerColor: e.target.value })}
                    className="w-[clamp(20px,4vw,28px)] h-[clamp(16px,3vw,22px)] border border-white/20 rounded-[2px] cursor-pointer bg-transparent p-0"
                  />
                  <span className="tabular-nums">{draft.visualizerColor}</span>
                </>
              )}
            </div>
            <div className={`flex items-center gap-[clamp(2px,0.5vw,6px)] ${smallText} text-white/60`}>
              <span>Unfocused:</span>
              {VIZ_UNFOCUSED.map((b) => (
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
          </div>
        )}
      </div>
    </div>
  );
}

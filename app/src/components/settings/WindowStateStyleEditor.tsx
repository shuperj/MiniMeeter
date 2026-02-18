import type { WindowStateStyle, BackgroundMode, VisualizerPreset } from "../../types/style";

interface WindowStateStyleEditorProps {
  label: string;
  draft: WindowStateStyle;
  onChange: (next: WindowStateStyle) => void;
  smallText: string;
  medText: string;
  inputCls: string;
  isUnfocused?: boolean;
}

const BG_MODES_FOCUSED: { value: BackgroundMode; label: string }[] = [
  { value: "solid", label: "Color" },
  { value: "acrylic", label: "Acrylic" },
  { value: "visualizer", label: "Visualizer" },
];

const BG_MODES_UNFOCUSED: { value: BackgroundMode; label: string }[] = [
  { value: "solid", label: "Color" },
  { value: "acrylic", label: "Acrylic" },
];

const VISUALIZER_PRESETS: { value: VisualizerPreset; label: string }[] = [
  { value: "xmb-smoke", label: "XMB Smoke" },
  { value: "starfield", label: "Starfield" },
  { value: "matrix-rain", label: "Matrix Rain" },
  { value: "plasma", label: "Plasma" },
  { value: "gradient-mesh", label: "Gradient Mesh" },
  { value: "noise-flow", label: "Noise Flow" },
  { value: "geometric-pulse", label: "Geometric Pulse" },
];

export default function WindowStateStyleEditor({
  label,
  draft,
  onChange,
  smallText,
  medText,
  inputCls: _inputCls,
  isUnfocused = false,
}: WindowStateStyleEditorProps) {
  const update = (patch: Partial<WindowStateStyle>) => {
    onChange({ ...draft, ...patch });
  };

  const bgModes = isUnfocused ? BG_MODES_UNFOCUSED : BG_MODES_FOCUSED;

  // For unfocused, clamp backgroundMode to valid options
  const effectiveBgMode = isUnfocused && draft.backgroundMode === "visualizer"
    ? "solid" as BackgroundMode
    : draft.backgroundMode;

  return (
    <div className="flex flex-col gap-[clamp(3px,0.8dvh,6px)]">
      {label && <span className={`${medText} font-semibold text-white/80`}>{label}</span>}

      <div className="flex flex-col gap-[clamp(2px,0.5dvh,4px)] pl-[clamp(6px,1.5vw,12px)]">
        {/* Background mode */}
        <div className={`flex items-center gap-[clamp(2px,0.5vw,6px)] ${smallText} text-white/60`}>
          <span>Background:</span>
          {bgModes.map((m) => (
            <button
              key={m.value}
              className={`px-[clamp(4px,0.8vw,8px)] py-[1px] rounded-[3px] border-none cursor-pointer ${smallText} font-medium`}
              style={{
                backgroundColor: effectiveBgMode === m.value ? "var(--accent)" : "rgba(255,255,255,0.1)",
                color: effectiveBgMode === m.value ? "var(--accent-fg)" : "rgba(255,255,255,0.7)",
              }}
              onClick={() => update({ backgroundMode: m.value })}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Solid color picker + opacity */}
        {effectiveBgMode === "solid" && (
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

        {/* Acrylic settings */}
        {effectiveBgMode === "acrylic" && (
          <div className="flex flex-col gap-[clamp(2px,0.4dvh,4px)]">
            <div className={`flex items-center gap-1 ${smallText} text-white/60`}>
              <span>Opacity:</span>
              <input
                type="range"
                min="0.05"
                max="0.95"
                step="0.05"
                value={draft.acrylicOpacity}
                onChange={(e) => update({ acrylicOpacity: Number(e.target.value) })}
                className="flex-1 accent-[var(--accent)] cursor-pointer"
              />
              <span className="tabular-nums w-[3ch] text-right">
                {Math.round(draft.acrylicOpacity * 100)}%
              </span>
            </div>
            <div className={`flex items-center gap-1 ${smallText} text-white/60`}>
              <span>Blur:</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={draft.acrylicBlur}
                onChange={(e) => update({ acrylicBlur: Number(e.target.value) })}
                className="flex-1 accent-[var(--accent)] cursor-pointer"
              />
              <span className="tabular-nums w-[3ch] text-right">
                {Math.round(draft.acrylicBlur * 100)}%
              </span>
            </div>
          </div>
        )}

        {/* Visualizer settings (focused only) */}
        {!isUnfocused && effectiveBgMode === "visualizer" && (
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
          </div>
        )}
      </div>
    </div>
  );
}

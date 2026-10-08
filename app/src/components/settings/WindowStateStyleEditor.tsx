import { VISUALIZER_FPS_OPTIONS, type CelEdges, type VisualizerFilter, type VisualizerFps } from "../../types/style";
import type { BackgroundStyle, BackgroundMode, VisualizerPreset, VisualizerColorSource, UnfocusedVisualizerMode } from "../../types/style";
import { PALETTE_MAX, PALETTE_MIN } from "../../lib/color";
import { PRESET_GROUPS, PRESET_LABELS } from "../../lib/visualizerPresets";
import { switchPreset } from "../../lib/presetStyles";
import { SettingRow, Segmented, Toggles } from "./SettingsGroup";
import { sliderCls, sliderValueCls, swatchCls } from "./shared";

interface WindowStateStyleEditorProps {
  draft: BackgroundStyle;
  onChange: (next: BackgroundStyle) => void;
  smallText: string;
  inputCls: string;
}

const BG_MODES: { value: BackgroundMode; label: string }[] = [
  { value: "solid", label: "Color" },
  { value: "acrylic", label: "Acrylic" },
  { value: "visualizer", label: "Visualizer" },
];

const VIZ_COLOR_SOURCES: { value: VisualizerColorSource; label: string }[] = [
  { value: "accent", label: "Accent" },
  { value: "custom", label: "Custom" },
  { value: "palette", label: "Palette" },
];

const VIZ_UNFOCUSED: { value: UnfocusedVisualizerMode; label: string }[] = [
  { value: "animated", label: "Same" },
  { value: "60", label: "60 fps" },
  { value: "30", label: "30 fps" },
  { value: "paused", label: "Paused" },
];

const VIZ_FILTERS: { value: VisualizerFilter; label: string }[] = [
  { value: "pixelate", label: "Pixelate" },
  { value: "cel", label: "Cel" },
  { value: "crt", label: "CRT" },
];

const CEL_EDGES: { value: CelEdges; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
];

/** The rows of the Background settings group (mode, then the mode's own
 *  options). Renders no heading or box; the caller supplies the group. */
export default function WindowStateStyleEditor({ draft, onChange, smallText, inputCls }: WindowStateStyleEditorProps) {
  const selectCls = `${inputCls} ${smallText} px-[clamp(2px,0.3vw,4px)] py-[2px] cursor-pointer max-w-full`;
  const update = (patch: Partial<BackgroundStyle>) => {
    onChange({ ...draft, ...patch });
  };

  return (
    <>
      <SettingRow label="Mode">
        <Segmented options={BG_MODES} value={draft.backgroundMode} onChange={(backgroundMode) => update({ backgroundMode })} />
      </SettingRow>

      {/* Solid color picker + opacity */}
      {draft.backgroundMode === "solid" && (
        <>
          <SettingRow label="Color">
            <input
              type="color"
              value={draft.backgroundColor}
              onChange={(e) => update({ backgroundColor: e.target.value })}
              className={swatchCls}
            />
            <span className="tabular-nums">{draft.backgroundColor}</span>
          </SettingRow>
          <SettingRow label="Opacity">
            <input
              type="range"
              min="0.05"
              max="1"
              step="0.05"
              value={draft.backgroundOpacity}
              onChange={(e) => update({ backgroundOpacity: Number(e.target.value) })}
              className={sliderCls}
            />
            <span className={sliderValueCls}>{Math.round(draft.backgroundOpacity * 100)}%</span>
          </SettingRow>
        </>
      )}

      {/* Visualizer settings: the basics, then an Advanced toggle */}
      {draft.backgroundMode === "visualizer" && (
        <>
          <SettingRow label="Preset" title="Each preset keeps its own strength, reactivity, speed, filters and colours.">
            <select
              className={selectCls}
              style={{ colorScheme: "dark" }}
              value={draft.visualizerPreset}
              onChange={(e) => onChange(switchPreset(draft, e.target.value as VisualizerPreset))}
            >
              {PRESET_GROUPS.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.presets.map((p) => (
                    <option key={p} value={p}>{PRESET_LABELS[p]}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </SettingRow>

          <SettingRow
            label="Colors"
            title="Accent follows the app accent color; Palette gives every visualizer several colors"
          >
            <Segmented
              options={VIZ_COLOR_SOURCES}
              value={draft.visualizerColorSource}
              onChange={(visualizerColorSource) => update({ visualizerColorSource })}
            />
            {draft.visualizerColorSource === "custom" && (
              <input
                type="color"
                value={draft.visualizerColor}
                onChange={(e) => update({ visualizerColor: e.target.value })}
                className={swatchCls}
                title={draft.visualizerColor}
              />
            )}
            {draft.visualizerColorSource === "palette" && (
              <>
                {draft.visualizerPalette.map((color, i) => (
                  <span key={i} className="flex items-center">
                    <input
                      type="color"
                      value={color}
                      onChange={(e) =>
                        update({
                          visualizerPalette: draft.visualizerPalette.map((c, j) => (j === i ? e.target.value : c)),
                        })
                      }
                      className={swatchCls}
                      title={color}
                    />
                    {draft.visualizerPalette.length > PALETTE_MIN && (
                      <button
                        className="text-white/40 hover:text-white/70 bg-transparent border-none cursor-pointer p-0 pl-[2px] text-[clamp(0.5rem,1.2vw,0.6rem)]"
                        onClick={() =>
                          update({ visualizerPalette: draft.visualizerPalette.filter((_, j) => j !== i) })
                        }
                        title="Remove color"
                      >
                        ✕
                      </button>
                    )}
                  </span>
                ))}
                {draft.visualizerPalette.length < PALETTE_MAX && (
                  <button
                    className={`px-[clamp(4px,0.8vw,8px)] py-[1px] rounded-[3px] border-none cursor-pointer ${smallText} font-medium`}
                    style={{ backgroundColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}
                    onClick={() =>
                      update({
                        visualizerPalette: [
                          ...draft.visualizerPalette,
                          draft.visualizerPalette[draft.visualizerPalette.length - 1],
                        ],
                      })
                    }
                    title="Add a color"
                  >
                    +
                  </button>
                )}
              </>
            )}
          </SettingRow>

          <SettingRow label="Strength" title="How strongly the visualizer shows through (its opacity)">
            <input
              type="range"
              min="0.05"
              max="1"
              step="0.05"
              value={draft.visualizerOpacity}
              onChange={(e) => update({ visualizerOpacity: Number(e.target.value) })}
              className={sliderCls}
            />
            <span className={sliderValueCls}>{Math.round(draft.visualizerOpacity * 100)}%</span>
          </SettingRow>

          <SettingRow label="Reactivity" title="How strongly it responds to the music. Double-click to reset.">
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={draft.visualizerIntensity}
              onChange={(e) => update({ visualizerIntensity: Number(e.target.value) })}
              onDoubleClick={() => update({ visualizerIntensity: 0.5 })}
              className={sliderCls}
            />
            <span className={sliderValueCls}>{Math.round(draft.visualizerIntensity * 100)}%</span>
          </SettingRow>

          <SettingRow label="Speed" title="How fast it moves on its own. Double-click for normal speed.">
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={draft.visualizerSpeed}
              onChange={(e) => update({ visualizerSpeed: Number(e.target.value) })}
              onDoubleClick={() => update({ visualizerSpeed: 0.5 })}
              className={sliderCls}
            />
            <span className={sliderValueCls}>{Math.round(draft.visualizerSpeed * 100)}%</span>
          </SettingRow>

          <SettingRow label="Filter" title="Pixelate and CRT also lower the render resolution, so they cost less">
            <Toggles
              options={VIZ_FILTERS}
              values={draft.visualizerFilters}
              onChange={(visualizerFilters) => update({ visualizerFilters })}
            />
          </SettingRow>

          {draft.visualizerFilters.includes("cel") && (
            <SettingRow label="Edges" title="The colour of Cel's outlines.">
              <Segmented
                options={CEL_EDGES}
                value={draft.visualizerCelEdges}
                onChange={(visualizerCelEdges) => update({ visualizerCelEdges })}
              />
            </SettingRow>
          )}

          <SettingRow label="Frame rate" title="Higher is smoother; lower saves CPU and GPU. The second choice applies while another window has focus.">
            <select
              className={selectCls}
              style={{ colorScheme: "dark" }}
              value={draft.visualizerFps}
              onChange={(e) => update({ visualizerFps: Number(e.target.value) as VisualizerFps })}
            >
              {VISUALIZER_FPS_OPTIONS.map((fps) => (
                <option key={fps} value={fps}>{fps} fps</option>
              ))}
            </select>
            <span>unfocused</span>
            <select
              className={selectCls}
              style={{ colorScheme: "dark" }}
              value={draft.unfocusedVisualizerMode}
              onChange={(e) => update({ unfocusedVisualizerMode: e.target.value as UnfocusedVisualizerMode })}
            >
              {VIZ_UNFOCUSED.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </SettingRow>
        </>
      )}
    </>
  );
}

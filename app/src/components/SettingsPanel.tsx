import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ChannelConfig, A1Device } from "../config";
import { STRIP_LABELS, DRIVER_OPTIONS } from "../config";
import type { StyleSettings } from "../types/style";
import { DEFAULT_STYLE_SETTINGS } from "../types/style";
import StyleTab from "./settings/StyleTab";

interface SettingsPanelProps {
  open: boolean;
  channels: ChannelConfig[];
  outputs: A1Device[];
  meterDecay: number;
  styleSettings: StyleSettings;
  onSaveChannels: (channels: ChannelConfig[]) => void;
  onSaveOutputs: (outputs: A1Device[]) => void;
  onSaveMeterDecay: (decay: number) => void;
  onSaveStyle: (style: StyleSettings) => void;
  onPreviewStyle?: (style: StyleSettings | null) => void;
  onClose: () => void;
}

type Tab = "channels" | "outputs" | "style";

const AVAILABLE_STRIPS = [0, 1, 2, 3, 4];

export default function SettingsPanel({
  open,
  channels,
  outputs,
  meterDecay,
  styleSettings,
  onSaveChannels,
  onSaveOutputs,
  onSaveMeterDecay,
  onSaveStyle,
  onPreviewStyle,
  onClose,
}: SettingsPanelProps) {
  const [tab, setTab] = useState<Tab>("channels");
  const [chDraft, setChDraft] = useState<ChannelConfig[]>([]);
  const [outDraft, setOutDraft] = useState<A1Device[]>([]);
  const [decayDraft, setDecayDraft] = useState(0.3);
  const [styleDraft, setStyleDraft] = useState<StyleSettings>(DEFAULT_STYLE_SETTINGS);

  const handleOpen = () => {
    setChDraft(channels.map((c) => ({ ...c })));
    setOutDraft(outputs.map((o) => ({ ...o })));
    setDecayDraft(meterDecay);
    setStyleDraft({ ...DEFAULT_STYLE_SETTINGS, ...styleSettings });
  };

  // Live preview style changes when on style tab
  useEffect(() => {
    if (open && tab === "style") {
      onPreviewStyle?.(styleDraft);
    }
  }, [styleDraft, open, tab]);

  // Clear preview on close
  useEffect(() => {
    if (!open) {
      onPreviewStyle?.(null);
    }
  }, [open]);

  // --- Channel helpers ---

  const updateChField = (idx: number, field: keyof ChannelConfig, value: string | number | boolean) => {
    setChDraft((prev) => prev.map((ch, i) => (i === idx ? { ...ch, [field]: value } : ch)));
  };

  const removeChannel = (idx: number) => {
    setChDraft((prev) => prev.filter((_, i) => i !== idx));
  };

  const moveChannel = (idx: number, dir: -1 | 1) => {
    setChDraft((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const addChannel = () => {
    const usedStrips = new Set(chDraft.map((c) => c.strip));
    const nextStrip = AVAILABLE_STRIPS.find((s) => !usedStrips.has(s)) ?? 0;
    setChDraft((prev) => [
      ...prev,
      {
        label: STRIP_LABELS[nextStrip]?.split(" ").pop() ?? `Strip ${nextStrip}`,
        strip: nextStrip,
        hasMute: false,
        minDb: -36,
        maxDb: 12,
        defaultDb: 0,
        levelScale: 1,
      },
    ]);
  };

  // --- Output helpers ---

  const updateOutField = (idx: number, field: keyof A1Device, value: string) => {
    setOutDraft((prev) => prev.map((o, i) => (i === idx ? { ...o, [field]: value } : o)));
  };

  const removeOutput = (idx: number) => {
    setOutDraft((prev) => prev.filter((_, i) => i !== idx));
  };

  const addOutput = () => {
    setOutDraft((prev) => [
      ...prev,
      { driver: "wdm", name: "", display: "" },
    ]);
  };

  // --- Save ---

  const handleSave = () => {
    // Auto-generate display from driver + name for outputs
    const finalOutputs = outDraft.map((o) => ({
      ...o,
      display: o.display || `${o.driver.toUpperCase()}: ${o.name}`,
    }));
    onSaveChannels(chDraft);
    onSaveOutputs(finalOutputs);
    onSaveMeterDecay(decayDraft);
    onSaveStyle(styleDraft);
    onClose();
  };

  // Shared styles
  const inputCls = "bg-white/10 border border-white/20 rounded-[3px] text-white/90 outline-none focus:border-[var(--accent)]";
  const smallText = "text-[clamp(0.5rem,1.5vw,0.65rem)]";
  const medText = "text-[clamp(0.55rem,1.8vw,0.75rem)]";

  return (
    <AnimatePresence onExitComplete={() => {}}>
      {open && (
        <motion.div
          className="absolute inset-0 z-50 flex flex-col rounded-[6px] overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onAnimationStart={() => handleOpen()}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-[#1a1a1a]/90" onClick={onClose} />

          {/* Panel content */}
          <div className="relative flex flex-col flex-1 p-[clamp(8px,2vw,16px)] gap-[clamp(6px,1.5dvh,12px)] overflow-hidden">
            {/* Header + close */}
            <div className="flex items-center justify-between">
              <span className="text-[clamp(0.7rem,2.5vw,0.95rem)] font-bold text-white/90">
                Settings
              </span>
              <button
                className="text-white/60 hover:text-white/90 text-[clamp(0.7rem,2vw,1rem)] bg-transparent border-none cursor-pointer p-1"
                onClick={onClose}
              >
                ✕
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 shrink-0">
              {(["channels", "outputs", "style"] as Tab[]).map((t) => (
                <button
                  key={t}
                  className={`px-[clamp(6px,1.5vw,12px)] py-[clamp(2px,0.5dvh,4px)] rounded-[3px] border-none cursor-pointer ${medText} font-semibold capitalize`}
                  style={{
                    backgroundColor: tab === t ? "var(--accent)" : "rgba(255,255,255,0.1)",
                    color: tab === t ? "var(--accent-fg)" : "rgba(255,255,255,0.7)",
                  }}
                  onClick={() => setTab(t)}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto flex flex-col gap-[clamp(4px,1dvh,8px)] min-h-0">
              {tab === "channels" && (
                <>
                  {/* Global meter decay setting */}
                  <div className="flex items-center gap-[clamp(4px,1vw,8px)] bg-white/5 rounded-[4px] p-[clamp(4px,1vw,8px)]">
                    <span className={`${smallText} text-white/60 whitespace-nowrap`}>Meter decay</span>
                    <input
                      type="range"
                      min="0.05"
                      max="2"
                      step="0.05"
                      value={decayDraft}
                      onChange={(e) => setDecayDraft(Number(e.target.value))}
                      onDoubleClick={() => setDecayDraft(0.3)}
                      className="flex-1 min-w-[clamp(40px,10vw,80px)] accent-[var(--accent)] cursor-pointer"
                    />
                    <span className={`${smallText} text-white/60 tabular-nums w-[4ch] text-right`}>
                      {decayDraft < 0.15 ? "Slow" : decayDraft > 1.5 ? "Fast" : decayDraft.toFixed(2)}
                    </span>
                  </div>

                  {chDraft.map((ch, idx) => (
                    <div
                      key={idx}
                      className="flex flex-wrap items-center gap-[clamp(4px,1vw,8px)] bg-white/5 rounded-[4px] p-[clamp(4px,1vw,8px)]"
                    >
                      {/* Reorder arrows */}
                      <div className="flex flex-col gap-0">
                        <button
                          className="bg-transparent border-none cursor-pointer text-white/40 hover:text-white/80 text-[clamp(0.5rem,1.2vw,0.65rem)] leading-none p-0 disabled:opacity-20 disabled:cursor-default"
                          onClick={() => moveChannel(idx, -1)}
                          disabled={idx === 0}
                          title="Move up"
                        >
                          ▲
                        </button>
                        <button
                          className="bg-transparent border-none cursor-pointer text-white/40 hover:text-white/80 text-[clamp(0.5rem,1.2vw,0.65rem)] leading-none p-0 disabled:opacity-20 disabled:cursor-default"
                          onClick={() => moveChannel(idx, 1)}
                          disabled={idx === chDraft.length - 1}
                          title="Move down"
                        >
                          ▼
                        </button>
                      </div>

                      {/* Label */}
                      <input
                        className={`${inputCls} ${medText} px-[clamp(3px,0.5vw,6px)] py-[2px] w-[clamp(48px,12vw,80px)]`}
                        value={ch.label}
                        onChange={(e) => updateChField(idx, "label", e.target.value)}
                        placeholder="Label"
                      />

                      {/* Strip selector */}
                      <select
                        className={`${inputCls} ${smallText} px-[clamp(2px,0.3vw,4px)] py-[2px] cursor-pointer`}
                        style={{ colorScheme: "dark" }}
                        value={ch.strip}
                        onChange={(e) => updateChField(idx, "strip", Number(e.target.value))}
                      >
                        {AVAILABLE_STRIPS.map((s) => (
                          <option key={s} value={s}>
                            Strip {s} — {STRIP_LABELS[s]}
                          </option>
                        ))}
                      </select>

                      {/* Mute toggle */}
                      <label className={`flex items-center gap-1 ${smallText} text-white/70 cursor-pointer select-none`}>
                        <input
                          type="checkbox"
                          checked={ch.hasMute}
                          onChange={(e) => updateChField(idx, "hasMute", e.target.checked)}
                          className="accent-[var(--accent)] cursor-pointer"
                        />
                        Mute
                      </label>

                      {/* dB range */}
                      <div className={`flex items-center gap-1 ${smallText} text-white/60`}>
                        <input
                          type="number"
                          className={`${inputCls} ${smallText} w-[clamp(30px,7vw,44px)] px-1 py-[1px] text-center`}
                          value={ch.minDb}
                          onChange={(e) => updateChField(idx, "minDb", Number(e.target.value))}
                        />
                        <span>to</span>
                        <input
                          type="number"
                          className={`${inputCls} ${smallText} w-[clamp(30px,7vw,44px)] px-1 py-[1px] text-center`}
                          value={ch.maxDb}
                          onChange={(e) => updateChField(idx, "maxDb", Number(e.target.value))}
                        />
                        <span>dB</span>
                      </div>

                      {/* Level scale — double-click slider to reset to 1x */}
                      <div className={`flex items-center gap-1 ${smallText} text-white/60`}>
                        <span className="whitespace-nowrap">Meter</span>
                        <input
                          type="range"
                          min="0.5"
                          max="10"
                          step="0.25"
                          value={ch.levelScale ?? 1}
                          onChange={(e) => updateChField(idx, "levelScale", Number(e.target.value))}
                          onDoubleClick={() => updateChField(idx, "levelScale", 1)}
                          className="w-[clamp(40px,10vw,64px)] accent-[var(--accent)] cursor-pointer"
                        />
                        <span className="tabular-nums w-[3ch] text-right">{(ch.levelScale ?? 1).toFixed(1)}x</span>
                      </div>

                      {/* Remove */}
                      <button
                        className="ml-auto text-red-400/70 hover:text-red-400 bg-transparent border-none cursor-pointer text-[clamp(0.6rem,1.8vw,0.8rem)] p-0"
                        onClick={() => removeChannel(idx)}
                        title="Remove channel"
                      >
                        ✕
                      </button>
                    </div>
                  ))}

                  {chDraft.length < 5 && (
                    <button
                      className={`flex items-center justify-center gap-1 bg-white/10 hover:bg-white/15 border border-dashed border-white/20 rounded-[4px] ${medText} text-white/70 py-[clamp(4px,0.8dvh,8px)] cursor-pointer`}
                      onClick={addChannel}
                    >
                      + Add Channel
                    </button>
                  )}
                </>
              )}

              {tab === "style" && (
                <StyleTab
                  draft={styleDraft}
                  onChange={setStyleDraft}
                  smallText={smallText}
                  medText={medText}
                  inputCls={inputCls}
                />
              )}

              {tab === "outputs" && (
                <>
                  <p className={`${smallText} text-white/50 m-0`}>
                    Configure A1 output device options shown in the title bar dropdown.
                  </p>
                  {outDraft.map((out, idx) => (
                    <div
                      key={idx}
                      className="flex flex-wrap items-center gap-[clamp(4px,1vw,8px)] bg-white/5 rounded-[4px] p-[clamp(4px,1vw,8px)]"
                    >
                      {/* Driver */}
                      <select
                        className={`${inputCls} ${smallText} px-[clamp(2px,0.3vw,4px)] py-[2px] cursor-pointer`}
                        style={{ colorScheme: "dark" }}
                        value={out.driver}
                        onChange={(e) => updateOutField(idx, "driver", e.target.value)}
                      >
                        {DRIVER_OPTIONS.map((d) => (
                          <option key={d} value={d}>
                            {d.toUpperCase()}
                          </option>
                        ))}
                      </select>

                      {/* Device name */}
                      <input
                        className={`${inputCls} ${medText} px-[clamp(3px,0.5vw,6px)] py-[2px] flex-1 min-w-[clamp(80px,20vw,160px)]`}
                        value={out.name}
                        onChange={(e) => updateOutField(idx, "name", e.target.value)}
                        placeholder="Device name (exact)"
                      />

                      {/* Display label */}
                      <input
                        className={`${inputCls} ${medText} px-[clamp(3px,0.5vw,6px)] py-[2px] flex-1 min-w-[clamp(60px,15vw,120px)]`}
                        value={out.display}
                        onChange={(e) => updateOutField(idx, "display", e.target.value)}
                        placeholder="Display label (auto)"
                      />

                      {/* Remove */}
                      <button
                        className="text-red-400/70 hover:text-red-400 bg-transparent border-none cursor-pointer text-[clamp(0.6rem,1.8vw,0.8rem)] p-0"
                        onClick={() => removeOutput(idx)}
                        title="Remove output"
                      >
                        ✕
                      </button>
                    </div>
                  ))}

                  <button
                    className={`flex items-center justify-center gap-1 bg-white/10 hover:bg-white/15 border border-dashed border-white/20 rounded-[4px] ${medText} text-white/70 py-[clamp(4px,0.8dvh,8px)] cursor-pointer`}
                    onClick={addOutput}
                  >
                    + Add Output Device
                  </button>
                </>
              )}
            </div>

            {/* Save / Cancel */}
            <div className="flex items-center gap-[clamp(4px,1vw,8px)] shrink-0 pt-[clamp(4px,1dvh,8px)]">
              <button
                className={`flex-1 rounded-[4px] border-none py-[clamp(4px,0.8dvh,8px)] ${medText} font-semibold cursor-pointer`}
                style={{ backgroundColor: "var(--accent)", color: "var(--accent-fg)" }}
                onClick={handleSave}
              >
                Save
              </button>
              <button
                className={`flex-1 rounded-[4px] border border-white/20 bg-transparent py-[clamp(4px,0.8dvh,8px)] ${medText} text-white/70 cursor-pointer hover:bg-white/10`}
                onClick={onClose}
              >
                Cancel
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

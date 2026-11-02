import type { ChannelConfig } from "../../config";
import type { EditionInfo, LaunchEdition } from "../../types/edition";
import { EDITION_NAMES, stripLabel, shortStripLabel } from "../../lib/editions";
import HotkeyRecorder from "./HotkeyRecorder";
import SettingsGroup from "./SettingsGroup";
import {
  inputCls,
  smallText,
  medText,
  rowLabelCls,
  sectionCls,
  addButtonCls,
  removeButtonCls,
  arrowButtonCls,
} from "./shared";

interface ChannelsTabProps {
  draft: ChannelConfig[];
  onChange: (next: ChannelConfig[]) => void;
  /** Edition to lay strips out for (live, or last seen when disconnected). */
  edition: EditionInfo;
  editionIsLive: boolean;
  launchEdition: LaunchEdition;
  onLaunchEditionChange: (next: LaunchEdition) => void;
  systemKeys: boolean;
  systemKeysBlocked: boolean;
  onSystemKeysChange: (enabled: boolean) => void;
}

const LAUNCH_OPTIONS: { value: LaunchEdition; label: string }[] = [
  { value: "auto", label: "Auto (last seen, else newest installed)" },
  { value: "potato", label: "Voicemeeter Potato" },
  { value: "banana", label: "Voicemeeter Banana" },
];

export default function ChannelsTab({
  draft,
  onChange,
  edition,
  editionIsLive,
  launchEdition,
  onLaunchEditionChange,
  systemKeys,
  systemKeysBlocked,
  onSystemKeysChange,
}: ChannelsTabProps) {
  const availableStrips = edition.strips.map((s) => s.index);

  /**
   * Strip options for one row: every strip of the current edition, plus this
   * row's own strip if it is out of range (a Potato config viewed while Banana
   * is running) so editing never silently drops a configured channel.
   */
  const stripOptionsFor = (strip: number): number[] =>
    availableStrips.includes(strip) ? availableStrips : [...availableStrips, strip];

  const updateField = (idx: number, field: keyof ChannelConfig, value: string | number | boolean) => {
    onChange(draft.map((ch, i) => (i === idx ? { ...ch, [field]: value } : ch)));
  };

  const removeChannel = (idx: number) => {
    onChange(draft.filter((_, i) => i !== idx));
  };

  const moveChannel = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= draft.length) return;
    const next = [...draft];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  };

  const addChannel = () => {
    const usedStrips = new Set(draft.map((c) => c.strip));
    const nextStrip = availableStrips.find((s) => !usedStrips.has(s)) ?? 0;
    onChange([
      ...draft,
      {
        label: shortStripLabel(edition, nextStrip),
        strip: nextStrip,
        hasMute: false,
      },
    ]);
  };

  return (
    <>
      {/* Edition — which Voicemeeter we lay strips out for, and which to launch */}
      <div className={sectionCls}>
        <div className={`flex items-center gap-1 ${smallText} text-white/85 flex-wrap`}>
          <span className={rowLabelCls}>Edition</span>
          <span className="text-white/80 font-semibold">{EDITION_NAMES[edition.edition]}</span>
          <span className="text-white/60">
            {editionIsLive ? "(detected)" : "(last seen — Voicemeeter not running)"}
          </span>
        </div>
        <div className={`flex items-center gap-1 ${smallText} text-white/85 flex-wrap`}>
          <span className={rowLabelCls}>Launch</span>
          <select
            className={`${inputCls} ${smallText} px-[clamp(2px,0.3vw,4px)] py-[2px] cursor-pointer max-w-full`}
            style={{ colorScheme: "dark" }}
            value={launchEdition}
            onChange={(e) => onLaunchEditionChange(e.target.value as LaunchEdition)}
            title="Edition started by the Launch Voicemeeter button"
          >
            {LAUNCH_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Gain structure — the Voicemeeter setup these faders assume */}
      <SettingsGroup title="Gain structure" defaultOpen storageKey="minimeeter.channelsTab.gain.open">
        <ul className={`m-0 pl-[1.2em] list-disc flex flex-col gap-[3px] ${smallText} text-white/85 leading-snug`}>
          <li>Windows: leave Voicemeeter's playback devices and your apps at 100%.</li>
          <li>Voicemeeter: keep hardware out faders at 0 dB and stay out of the red.</li>
          <li>Mic: with its strip at 0 dB, set the interface gain so speech peaks around -18 to -12 dB.</li>
          <li>Mix with the faders here. Double-clicking one returns it to 0 dB.</li>
        </ul>
        <label className={`flex items-center gap-1 ${smallText} text-white/85 cursor-pointer select-none`}>
          <input
            type="checkbox"
            checked={systemKeys}
            onChange={(e) => onSystemKeysChange(e.target.checked)}
            className="accent-[var(--accent)] cursor-pointer"
          />
          Use the keyboard's volume and mute keys
        </label>
        <p className={`m-0 ${smallText} text-white/55 leading-snug`}>
          They act on every hardware output at once, up to +12 dB. First <strong className="font-bold text-white/90">TURN OFF</strong> Hook Volume Keys in
          Voicemeeter, under Menu &gt; Shortcut Key (Hook).
        </p>
        {systemKeys && systemKeysBlocked && (
          <p className={`m-0 ${smallText} text-amber-300 leading-snug`}>
            ⚠ Another program is holding these keys, most likely that Voicemeeter hook. They'll start working here as
            soon as it lets go.
          </p>
        )}
      </SettingsGroup>

      {draft.map((ch, idx) => {
        const stripOutOfRange = !availableStrips.includes(ch.strip);

        return (
          <div key={idx} className="bg-white/5 rounded-[4px] overflow-hidden shrink-0">
            {/* Compact header — identity only, so the list stays scannable */}
            <div className="flex items-center gap-[clamp(3px,0.8vw,6px)] p-[clamp(4px,1vw,8px)]">
              <div className="flex flex-col gap-0 shrink-0">
                <button className={arrowButtonCls} onClick={() => moveChannel(idx, -1)} disabled={idx === 0} title="Move up">
                  ▲
                </button>
                <button
                  className={arrowButtonCls}
                  onClick={() => moveChannel(idx, 1)}
                  disabled={idx === draft.length - 1}
                  title="Move down"
                >
                  ▼
                </button>
              </div>

              <input
                className={`${inputCls} ${medText} px-[clamp(3px,0.5vw,6px)] py-[2px] w-[clamp(48px,12vw,80px)]`}
                value={ch.label}
                onChange={(e) => updateField(idx, "label", e.target.value)}
                placeholder="Label"
              />

              <select
                className={`${inputCls} ${smallText} px-[clamp(2px,0.3vw,4px)] py-[2px] cursor-pointer`}
                style={{ colorScheme: "dark" }}
                value={ch.strip}
                onChange={(e) => updateField(idx, "strip", Number(e.target.value))}
              >
                {stripOptionsFor(ch.strip).map((s) => (
                  <option key={s} value={s}>
                    Strip {s} — {stripLabel(edition, s)}
                  </option>
                ))}
              </select>
              {stripOutOfRange && (
                <span
                  className={`${smallText} text-amber-300/80 cursor-help shrink-0`}
                  title={`Strip ${ch.strip} does not exist in ${EDITION_NAMES[edition.edition]}. Kept so you don't lose it.`}
                >
                  ⚠
                </span>
              )}

              <label className={`flex items-center gap-1 ${smallText} text-white/70 cursor-pointer select-none shrink-0`}>
                <input
                  type="checkbox"
                  checked={ch.hasMute}
                  onChange={(e) => updateField(idx, "hasMute", e.target.checked)}
                  className="accent-[var(--accent)] cursor-pointer"
                />
                Mute
              </label>

              <button className={`ml-auto ${removeButtonCls}`} onClick={() => removeChannel(idx)} title="Remove channel">
                ✕
              </button>
            </div>

            {ch.hasMute && (
              <div className={`border-t border-white/10 px-[clamp(6px,1.5vw,12px)] py-[clamp(4px,1vw,8px)] flex items-center gap-1 ${smallText} text-white/85 flex-wrap`}>
                <span className={rowLabelCls}>Hotkey</span>
                <HotkeyRecorder
                  value={ch.muteHotkey ?? ""}
                  onChange={(accel) => updateField(idx, "muteHotkey", accel)}
                />
              </div>
            )}
          </div>
        );
      })}

      {draft.length < edition.stripCount && (
        <button className={addButtonCls} onClick={addChannel}>
          + Add Channel
        </button>
      )}
    </>
  );
}

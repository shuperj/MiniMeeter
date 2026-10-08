import { useState, type ReactNode } from "react";
import { medText, smallText, settingLabelCls } from "./shared";

/** Read a remembered open/closed state; storage can be missing or blocked. */
function readOpen(storageKey: string | undefined, fallback: boolean): boolean {
  if (!storageKey) return fallback;
  try {
    const v = localStorage.getItem(storageKey);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}

function writeOpen(storageKey: string | undefined, open: boolean) {
  if (!storageKey) return;
  try {
    localStorage.setItem(storageKey, open ? "1" : "0");
  } catch {
    // Not persisting is fine; the group just reopens at its default next time.
  }
}

interface SettingsGroupProps {
  title: string;
  defaultOpen?: boolean;
  /** localStorage key that remembers whether the group was left open. */
  storageKey?: string;
  children: ReactNode;
}

/** Open/closed state that's remembered across sessions under `storageKey`. */
export function useRememberedOpen(storageKey: string | undefined, defaultOpen: boolean): [boolean, () => void] {
  const [open, setOpen] = useState(() => readOpen(storageKey, defaultOpen));
  const toggle = () => {
    const next = !open;
    setOpen(next);
    writeOpen(storageKey, next);
  };
  return [open, toggle];
}

/** A collapsible box of setting rows with a ▸/▾ header. */
export default function SettingsGroup({ title, defaultOpen = false, storageKey, children }: SettingsGroupProps) {
  const [open, toggle] = useRememberedOpen(storageKey, defaultOpen);

  return (
    <div className="bg-white/5 rounded-[4px] overflow-hidden shrink-0">
      <button
        className={`w-full flex items-center gap-[clamp(4px,1vw,8px)] p-[clamp(4px,1vw,8px)] bg-transparent hover:bg-white/5 border-none cursor-pointer text-left ${medText} font-semibold text-white/80`}
        onClick={toggle}
        aria-expanded={open}
      >
        <span className={`${smallText} text-white/50 w-[1.2em] text-center`} aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
        {title}
      </button>
      {open && (
        <div className="border-t border-white/10 px-[clamp(6px,1.5vw,12px)] py-[clamp(4px,1vw,8px)] flex flex-col gap-[clamp(3px,0.8dvh,6px)]">
          {children}
        </div>
      )}
    </div>
  );
}

interface SettingRowProps {
  label: string;
  /** Tooltip on the label. */
  title?: string;
  /** Muted explanation shown under the control, aligned with it. */
  hint?: ReactNode;
  /** Pin the label to the top for controls that span several lines. */
  alignTop?: boolean;
  children: ReactNode;
}

/** One label | control(s) row. The label column has a fixed width so rows line
 *  up; the controls wrap inside their own column when the window is narrow. */
export function SettingRow({ label, title, hint, alignTop, children }: SettingRowProps) {
  return (
    <div className={`flex flex-col gap-[1px] ${smallText} text-white/60`}>
      <div className={`flex ${alignTop ? "items-start" : "items-center"} gap-[clamp(4px,1vw,8px)]`}>
        <span className={`${settingLabelCls} ${alignTop ? "pt-[2px]" : ""}`} title={title}>
          {label}
        </span>
        <div className="flex-1 min-w-0 flex items-center flex-wrap gap-[clamp(2px,0.5vw,6px)]">{children}</div>
      </div>
      {hint && (
        <div className="flex gap-[clamp(4px,1vw,8px)]">
          <span className={settingLabelCls} aria-hidden="true" />
          <span className="flex-1 min-w-0 text-white/35">{hint}</span>
        </div>
      )}
    </div>
  );
}

interface SegmentedProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      className={`px-[clamp(4px,0.8vw,8px)] py-[1px] rounded-[3px] border-none cursor-pointer ${smallText} font-medium`}
      style={{
        backgroundColor: on ? "var(--accent)" : "rgba(255,255,255,0.1)",
        color: on ? "var(--accent-fg)" : "rgba(255,255,255,0.7)",
      }}
      aria-pressed={on}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/** A row of accent-filled toggle buttons, one of which is selected. */
export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  return (
    <div className="flex items-center flex-wrap gap-[clamp(2px,0.5vw,6px)]">
      {options.map((o) => (
        <Chip key={o.value} label={o.label} on={value === o.value} onClick={() => onChange(o.value)} />
      ))}
    </div>
  );
}

interface TogglesProps<T extends string> {
  options: readonly { value: T; label: string }[];
  values: readonly T[];
  /** Called with the new set, kept in the options' order. */
  onChange: (values: T[]) => void;
}

/** Like Segmented, but any number of the buttons can be on at once. */
export function Toggles<T extends string>({ options, values, onChange }: TogglesProps<T>) {
  const toggle = (v: T) => {
    const next = values.includes(v) ? values.filter((x) => x !== v) : [...values, v];
    onChange(options.map((o) => o.value).filter((x) => next.includes(x)));
  };
  return (
    <div className="flex items-center flex-wrap gap-[clamp(2px,0.5vw,6px)]">
      {options.map((o) => (
        <Chip key={o.value} label={o.label} on={values.includes(o.value)} onClick={() => toggle(o.value)} />
      ))}
    </div>
  );
}

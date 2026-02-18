import { getCurrentWindow } from "@tauri-apps/api/window";
import type { A1Device } from "../config";
import { invoke } from "@tauri-apps/api/core";

interface TitlebarProps {
  selectedA1: number;
  a1Choices: A1Device[];
  onA1Change: (index: number) => void;
  onSettingsClick: () => void;
}

export default function Titlebar({ selectedA1, a1Choices, onA1Change, onSettingsClick }: TitlebarProps) {
  const appWindow = getCurrentWindow();

  const handleA1Change = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const idx = Number(e.target.value);
    const device: A1Device = a1Choices[idx];
    onA1Change(idx);
    try {
      await invoke("vm_set_a1_device", { driver: device.driver, name: device.name });
    } catch {
      // Will be apparent if audio doesn't switch
    }
  };

  return (
    <div
      className="flex items-center h-[clamp(24px,8dvh,36px)] px-[clamp(6px,2vw,12px)] select-none shrink-0"
      style={{ backgroundColor: "var(--accent)" }}
      data-tauri-drag-region
    >
      {/* Settings gear */}
      <button
        className="w-[clamp(16px,4vw,24px)] h-[clamp(16px,4dvh,24px)] flex items-center justify-center rounded-[3px] border-none cursor-pointer hover:bg-white/20 mr-[clamp(2px,0.5vw,6px)] shrink-0"
        style={{ color: "var(--accent-fg)", backgroundColor: "transparent" }}
        onClick={onSettingsClick}
        title="Settings"
      >
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-[clamp(10px,2.5vw,14px)] h-[clamp(10px,2.5vw,14px)]"
        >
          <path
            fillRule="evenodd"
            d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.062 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {/* App title — hides at very small widths */}
      <span
        className="text-[clamp(0.55rem,2.2vw,0.75rem)] font-bold mr-auto truncate hidden min-[260px]:block"
        style={{ color: "var(--accent-fg)" }}
        data-tauri-drag-region
      >
        MiniMeeter
      </span>

      {/* A1 picker */}
      <div className="flex items-center gap-[clamp(2px,0.5vw,4px)] ml-auto mr-[clamp(4px,1vw,8px)]">
        <span
          className="text-[clamp(0.5rem,1.8vw,0.65rem)] font-bold hidden min-[240px]:block"
          style={{ color: "var(--accent-fg)" }}
        >
          A1:
        </span>
        <select
          className="bg-black/20 border-none rounded-[3px] text-[clamp(0.5rem,1.6vw,0.65rem)] px-[clamp(2px,0.5vw,4px)] py-[1px] max-w-[clamp(60px,20vw,160px)] truncate outline-none cursor-pointer"
          style={{ color: "var(--accent-fg)" }}
          value={selectedA1}
          onChange={handleA1Change}
        >
          {a1Choices.map((d, i) => (
            <option key={i} value={i}>
              {d.display}
            </option>
          ))}
        </select>
      </div>

      {/* Window controls */}
      <div className="flex items-center gap-[2px]">
        <button
          className="w-[clamp(16px,4vw,28px)] h-[clamp(16px,4dvh,28px)] flex items-center justify-center rounded-[3px] border-none cursor-pointer text-[clamp(0.5rem,1.5vw,0.7rem)] hover:bg-white/20"
          style={{ color: "var(--accent-fg)", backgroundColor: "transparent" }}
          onClick={() => appWindow.minimize()}
        >
          ─
        </button>
        <button
          className="w-[clamp(16px,4vw,28px)] h-[clamp(16px,4dvh,28px)] flex items-center justify-center rounded-[3px] border-none cursor-pointer text-[clamp(0.5rem,1.5vw,0.7rem)] hover:bg-red-500/80"
          style={{ color: "var(--accent-fg)", backgroundColor: "transparent" }}
          onClick={() => appWindow.close()}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

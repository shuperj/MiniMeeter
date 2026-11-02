import { useLayoutEffect, useRef, useState } from "react";
import { useDismiss } from "../hooks/useDismiss";
import { fitMenu } from "../lib/contextMenu";

const itemCls =
  "w-full text-left px-3 py-[5px] bg-transparent border-none cursor-pointer text-[clamp(0.6875rem,1.6vw,0.75rem)] text-white/90 hover:bg-white/10 disabled:opacity-40 disabled:cursor-default disabled:hover:bg-transparent whitespace-nowrap";
const dividerCls = "my-1 border-t border-white/10";

interface AppContextMenuProps {
  x: number;
  y: number;
  /** Current control style; the menu offers the other one. */
  knobMode: boolean;
  connected: boolean;
  onUnity: () => void;
  onToggleControls: () => void;
  onOpenApps: () => void;
  onOpenSettings: () => void;
  onClose: () => void;
}

/** The right-click menu for the main window, replacing the WebView's own. */
export default function AppContextMenu({
  x,
  y,
  knobMode,
  connected,
  onUnity,
  onToggleControls,
  onOpenApps,
  onOpenSettings,
  onClose,
}: AppContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  useDismiss(true, ref, onClose);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setPos(
      fitMenu(
        x,
        y,
        { width: el.offsetWidth, height: el.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [x, y]);

  const run = (action: () => void) => () => {
    onClose();
    action();
  };

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-[60] w-max rounded-[4px] border border-white/15 bg-[#1a1a1a] py-1 shadow-lg"
      style={pos}
    >
      <button role="menuitem" className={itemCls} disabled={!connected} onClick={run(onUnity)}>
        Unity (0dB all)
      </button>
      <button role="menuitem" className={itemCls} onClick={run(onToggleControls)}>
        {knobMode ? "Switch to faders" : "Switch to knobs"}
      </button>
      <div className={dividerCls} />
      <button role="menuitem" className={itemCls} onClick={run(onOpenApps)}>
        App view
      </button>
      <button role="menuitem" className={itemCls} onClick={run(onOpenSettings)}>
        Settings
      </button>
    </div>
  );
}

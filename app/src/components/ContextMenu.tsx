import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useDismiss } from "../hooks/useDismiss";
import { fitMenu } from "../lib/contextMenu";

export const contextItemCls =
  "w-full text-left px-3 py-[5px] bg-transparent border-none cursor-pointer text-[clamp(0.6875rem,1.6vw,0.75rem)] text-white/90 hover:bg-white/10 disabled:opacity-40 disabled:cursor-default disabled:hover:bg-transparent whitespace-nowrap flex items-center justify-between gap-4";
export const contextDividerCls = "my-1 border-t border-white/10";
export const contextHeaderCls =
  "px-3 pt-1 pb-[3px] text-[clamp(0.625rem,1.4vw,0.6875rem)] uppercase tracking-wide text-white/50 whitespace-nowrap";

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  children: ReactNode;
}

/** A right-click menu at (x, y), kept inside the window. */
export default function ContextMenu({ x, y, onClose, children }: ContextMenuProps) {
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

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-[60] w-max rounded-[4px] border border-white/15 bg-[#1a1a1a] py-1 shadow-lg"
      style={pos}
    >
      {children}
    </div>
  );
}

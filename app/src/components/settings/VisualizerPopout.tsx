import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { smallText } from "./shared";

/** Gap from the window edge where the popout first appears. */
const EDGE_GAP = 12;
/** Keeps the starting spot clear of the Save and Cancel row. */
const FOOTER_GAP = 64;
/** Corner left to the native resize grip, so grabbing it doesn't start a drag. */
const RESIZE_GRIP = 18;

interface VisualizerPopoutProps {
  onClose: () => void;
  children: ReactNode;
}

/** A floating live preview over Settings: drag it anywhere, resize from its corner. */
export default function VisualizerPopout({ onClose, children }: VisualizerPopoutProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const drag = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return;
    // Bottom right: the Background rows being adjusted are near the top.
    setPos({
      left: Math.max(0, parent.clientWidth - el.offsetWidth - EDGE_GAP),
      top: Math.max(0, parent.clientHeight - el.offsetHeight - FOOTER_GAP),
    });
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.right - e.clientX < RESIZE_GRIP && rect.bottom - e.clientY < RESIZE_GRIP) return;
    drag.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, left: pos.left, top: pos.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = ref.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!d || d.pointerId !== e.pointerId || !el || !parent) return;
    setPos({
      left: Math.max(0, Math.min(parent.clientWidth - el.offsetWidth, d.left + e.clientX - d.x)),
      top: Math.max(0, Math.min(parent.clientHeight - el.offsetHeight, d.top + e.clientY - d.y)),
    });
  };

  const endDrag = () => {
    drag.current = null;
  };

  return (
    <div
      ref={ref}
      className="absolute z-10 isolate overflow-hidden rounded-[6px] border border-white/25 bg-[#0c0c0e] shadow-[0_8px_24px_rgba(0,0,0,0.6)] cursor-move touch-none"
      style={{
        left: pos.left,
        top: pos.top,
        width: "clamp(150px, 45vw, 320px)",
        height: "clamp(110px, 32vw, 220px)",
        minWidth: 120,
        minHeight: 90,
        maxWidth: "100%",
        maxHeight: "100%",
        resize: "both",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {children}
      <button
        className={`absolute top-[3px] right-[3px] w-[20px] h-[20px] flex items-center justify-center rounded-[3px] border-none bg-black/60 hover:bg-black/80 text-white/90 cursor-pointer p-0 ${smallText}`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onClose}
        title="Close preview"
      >
        ✕
      </button>
    </div>
  );
}

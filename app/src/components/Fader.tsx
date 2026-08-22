import { useRef, useCallback, useEffect } from "react";
import { motion, useTransform, useSpring } from "framer-motion";
import { WHEEL_STEP_DB } from "../config";
import MuteButton from "./MuteButton";

interface FaderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  hasMute: boolean;
  muted: boolean;
  level: number;
  levelScale: number;
  meterDecay: number;
  /** Value this fader snaps to on double-click. */
  defaultDb: number;
  onChange: (value: number) => void;
  onMuteToggle: (muted: boolean) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}

/** Treat two presses this close together as a double-click. */
const DOUBLE_CLICK_MS = 350;

export default function Fader({
  label,
  value,
  min,
  max,
  hasMute,
  muted,
  level,
  levelScale,
  meterDecay,
  defaultDb,
  onChange,
  onMuteToggle,
  onDragStart,
  onDragEnd,
}: FaderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  // --- Live level meter (smooth tracking, silence hold + configurable decay) ---
  const meterRef = useRef<HTMLDivElement>(null);
  const targetLevel = useRef(0);
  const displayLevel = useRef(0);
  const lastSignalTime = useRef(0);
  const rafRef = useRef<number>(0);
  const decayRef = useRef(meterDecay);

  useEffect(() => {
    targetLevel.current = level * levelScale;
  }, [level, levelScale]);

  useEffect(() => {
    decayRef.current = meterDecay;
  }, [meterDecay]);

  useEffect(() => {
    let lastTime = performance.now();
    const SIGNAL_THRESHOLD = 0.005;
    const HOLD_MS = 200;
    const ATTACK_SPEED = 14;
    const RELEASE_SPEED = 10;

    const animate = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      const target = targetLevel.current;
      const current = displayLevel.current;

      if (target > SIGNAL_THRESHOLD) {
        // Signal present — smooth exponential tracking
        lastSignalTime.current = now;
        const speed = target >= current ? ATTACK_SPEED : RELEASE_SPEED;
        const factor = 1 - Math.exp(-speed * dt);
        displayLevel.current = current + (target - current) * factor;
      } else if (now - lastSignalTime.current > HOLD_MS) {
        // Silence — creep down at configurable decay speed
        displayLevel.current = Math.max(0, current - decayRef.current * dt);
      }
      // else: within hold period, keep current level

      if (meterRef.current) {
        meterRef.current.style.height = `${Math.min(displayLevel.current * 100, 100)}%`;
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Normalized 0..1 where 0 = max dB (top) and 1 = min dB (bottom)
  const normalized = (max - value) / (max - min);

  // Spring-animated position for smooth external updates
  const springY = useSpring(normalized, { damping: 30, stiffness: 300 });

  // Update spring when value changes externally (not during drag)
  useEffect(() => {
    if (!isDragging.current) {
      springY.set(normalized);
    }
  }, [normalized, springY]);

  // Fill height tracks the thumb position
  const fillScale = useTransform(springY, [0, 1], [1, 0]);

  // --- Dragging ---
  //
  // Pointer capture with a preserved grab offset, rather than framer-motion's
  // pan gesture. Pan waits for a movement threshold before firing and works in
  // deltas, which made this feel unresponsive and drifty. Here the whole track
  // column is a grab surface and the thumb never jumps to the cursor: press
  // anywhere and it moves relative to where you started, so a plain click can't
  // yank the level.
  const drag = useRef<{ pointerId: number; offset: number; startY: number } | null>(null);
  const lastPressTime = useRef(0);
  // A quick drag-release-drag must not be mistaken for a double-click, so a
  // gesture that actually moved disqualifies the next press.
  const movedDuringDrag = useRef(false);

  const applyNorm = useCallback(
    (norm: number) => {
      springY.jump(norm);
      const db = max - norm * (max - min);
      onChange(Math.round(db * 10) / 10);
    },
    [max, min, onChange, springY],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      if (rect.height <= 0) return;

      const now = performance.now();
      const isDoubleClick = now - lastPressTime.current < DOUBLE_CLICK_MS;
      lastPressTime.current = now;

      if (isDoubleClick) {
        // Snap to this channel's default. Detected by timing rather than the
        // dblclick event, because preventDefault below suppresses the
        // compatibility mouse events that would normally produce it.
        // The stored default can sit outside the range, so clamp it.
        const target = Math.max(min, Math.min(max, defaultDb));
        applyNorm((max - target) / (max - min));
        return;
      }

      // Offset from the thumb's current position keeps the grab point steady,
      // so pressing away from the thumb doesn't yank the level.
      const thumbY = rect.top + springY.get() * rect.height;
      drag.current = { pointerId: e.pointerId, offset: e.clientY - thumbY, startY: e.clientY };
      movedDuringDrag.current = false;
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
      isDragging.current = true;
      onDragStart();
    },
    [applyNorm, defaultDb, max, min, onDragStart, springY],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const state = drag.current;
      if (!state || state.pointerId !== e.pointerId) return;
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      if (rect.height <= 0) return;

      if (Math.abs(e.clientY - state.startY) > 3) movedDuringDrag.current = true;

      const norm = Math.max(
        0,
        Math.min(1, (e.clientY - state.offset - rect.top) / rect.height),
      );
      applyNorm(norm);
    },
    [applyNorm],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const state = drag.current;
      if (!state || state.pointerId !== e.pointerId) return;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      drag.current = null;
      isDragging.current = false;
      // Only a stationary press can begin a double-click.
      if (movedDuringDrag.current) lastPressTime.current = 0;
      onDragEnd();
    },
    [onDragEnd],
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      const direction = e.deltaY < 0 ? 1 : -1;
      const newVal = Math.max(min, Math.min(max, value + WHEEL_STEP_DB * direction));
      onChange(Math.round(newVal * 10) / 10);
    },
    [min, max, value, onChange],
  );

  const formatDb = (v: number): string => {
    const rounded = Math.round(v);
    const sign = rounded >= 0 ? "+" : "-";
    return `${sign}${String(Math.abs(rounded)).padStart(2, "0")} dB`;
  };

  return (
    <div className="flex flex-col items-center gap-[clamp(2px,1dvh,6px)] min-w-0 flex-1">
      {/* Channel label */}
      <span className="text-[clamp(0.6rem,2.5vw,0.875rem)] font-bold text-white/90 truncate w-full text-center">
        {label}
      </span>

      {/* Fader border + track */}
      <div
        className="rounded-[4px] p-[1px] w-full flex-1 flex flex-col min-h-0"
        style={{ backgroundColor: "var(--accent)", maxWidth: "var(--fader-max-w, clamp(42px, 9vw, 68px))" }}
        onWheel={handleWheel}
      >
        <div className="bg-[#1e1e1e]/80 rounded-[3px] p-[clamp(4px,1vw,8px)] flex flex-col items-center gap-[clamp(2px,0.5dvh,4px)] flex-1 min-h-0">
          {/* dB readout */}
          <span className="text-[clamp(0.55rem,2vw,0.75rem)] font-bold text-white/90 tabular-nums whitespace-nowrap">
            {formatDb(value)}
          </span>

          {/* Grab surface — the full column width, so you never have to hit the
              thin track or the thumb exactly. */}
          <div
            className="relative flex-1 min-h-[80px] w-full flex justify-center touch-none cursor-grab active:cursor-grabbing"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            title={`Double-click to reset to ${formatDb(Math.max(min, Math.min(max, defaultDb)))}`}
          >
            {/* Visual track */}
            <div
              ref={trackRef}
              className="relative w-[clamp(8px,2vw,12px)] h-full bg-[#2b2b2b] rounded-full"
            >
              {/* Fill from bottom */}
              <motion.div
                className="absolute bottom-0 left-0 right-0 rounded-full origin-bottom pointer-events-none"
                style={{
                  scaleY: fillScale,
                  backgroundColor: "var(--accent)",
                  opacity: 0.4,
                  height: "100%",
                }}
              />

              {/* Audio level meter — driven by RAF peak-hold loop */}
              <div
                ref={meterRef}
                className="absolute bottom-0 left-[15%] right-[15%] rounded-full pointer-events-none"
                style={{
                  height: "0%",
                  backgroundColor: "var(--accent)",
                  opacity: 0.7,
                }}
              />

              {/* Thumb — pentagon pointing right. Purely visual; the wrapper
                  above owns all pointer handling. */}
              <motion.div
                className="absolute pointer-events-none flex items-center justify-center"
                style={{
                  width: "clamp(18px,4.5vw,30px)",
                  height: "clamp(8px,1.5dvh,14px)",
                  top: useTransform(
                    springY,
                    (v: number) => `calc(${v * 100}% - clamp(4px,0.75dvh,7px))`,
                  ),
                  right: "35%",
                }}
              >
                <svg viewBox="0 0 24 14" className="w-full h-full" style={{ overflow: "visible" }}>
                  <path
                    d="M 0 0 L 18 0 L 24 7 L 18 14 L 0 14 Z"
                    fill="var(--accent)"
                    stroke="white"
                    strokeWidth="1.5"
                  />
                </svg>
              </motion.div>
            </div>
          </div>

          {/* Mute button */}
          {hasMute && (
            <MuteButton muted={muted} onToggle={() => onMuteToggle(!muted)} />
          )}
        </div>
      </div>
    </div>
  );
}

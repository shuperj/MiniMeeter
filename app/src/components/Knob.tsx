import { useRef, useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useSpring, useMotionValueEvent } from "framer-motion";
import { WHEEL_STEP_DB } from "../config";
import MuteButton from "./MuteButton";
import { useLevelMeter } from "../hooks/useLevelMeter";
import { arcPath, dbToNorm, dragNorm, KNOB_START, KNOB_SWEEP, normToAngle, normToDb, polar } from "../lib/knob";

interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  hasMute: boolean;
  muted: boolean;
  level: number;
  levelScale: number;
  meterDecay: number;
  /** Value this knob snaps to on double-click. */
  defaultDb: number;
  onChange: (value: number) => void;
  onMuteToggle: (muted: boolean) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}

/** Treat two presses this close together as a double-click. */
const DOUBLE_CLICK_MS = 350;
/** Arrow keys and Shift+wheel step this far; plain wheel uses WHEEL_STEP_DB like the faders. */
const FINE_STEP_DB = 0.5;

// Dial geometry after PlantainMeeter's knob (its 40-unit dial scaled to a
// 100x100 viewBox, which then scales to whatever the cell allows): a gain
// track, a level-meter ring just outside it, a needle from the hub.
const C = 50;
const R_TRACK = 35;
const R_METER = 42.5;
const SWEEP_END = KNOB_START + KNOB_SWEEP;
const METER_D = arcPath(C, C, R_METER, KNOB_START, SWEEP_END);
const TRACK_D = arcPath(C, C, R_TRACK, KNOB_START, SWEEP_END);
const R_DISH = 27.5;
// The pointer runs from partway out to the dish's lip, leaving its hollow clear.
const NEEDLE_IN = polar(C, C, 12, 0);
const NEEDLE_OUT = polar(C, C, 24, 0);

/** The live level, in the visualizer's colour so it reads apart from the accent gain fill. */
const METER_COLOR = "rgb(var(--viz-r, 58), var(--viz-g, 134), var(--viz-b, 255))";
const MUTED_RED = "rgb(239,68,68)";

function formatDb(v: number): string {
  const rounded = Math.round(v);
  const sign = rounded >= 0 ? "+" : "-";
  return `${sign}${String(Math.abs(rounded)).padStart(2, "0")}`;
}

/**
 * A rotary alternative to Fader with the same behaviour: drag, wheel,
 * double-click to the channel default, mute, live meter. Unlike a fixed-size
 * dial it fills whatever cell App's grid gives it, so knobs grow with the
 * window instead of floating in empty space.
 */
export default function Knob({
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
}: KnobProps) {
  const isDragging = useRef(false);
  const [active, setActive] = useState(false);

  // --- Live level meter: the outer ring, drawn with a dash so it never rebuilds a path ---
  const meterRef = useRef<SVGPathElement>(null);
  const paintMeter = useCallback((lvl: number) => {
    const el = meterRef.current;
    if (!el) return;
    el.style.strokeDasharray = `${lvl} 1`;
    // A zero-length dash still draws a round cap; hide it at silence.
    el.style.opacity = lvl > 0.004 ? "1" : "0";
  }, []);
  useLevelMeter(level, levelScale, meterDecay, paintMeter);

  // --- Position: 0..1 from the minimum, spring-smoothed for external changes ---
  const norm = dbToNorm(value, min, max);
  const spring = useSpring(norm, { damping: 30, stiffness: 300 });

  useEffect(() => {
    if (!isDragging.current) spring.set(norm);
  }, [norm, spring]);

  const fillRef = useRef<SVGPathElement>(null);
  const pointerRef = useRef<SVGGElement>(null);

  const paintPosition = useCallback((n: number) => {
    if (fillRef.current) {
      fillRef.current.style.strokeDasharray = `${n} 1`;
      fillRef.current.style.opacity = n > 0.004 ? "1" : "0";
    }
    pointerRef.current?.setAttribute("transform", `rotate(${normToAngle(n)} ${C} ${C})`);
  }, []);

  useMotionValueEvent(spring, "change", paintPosition);
  // Paint before the first frame; the spring only reports changes.
  useLayoutEffect(() => {
    paintPosition(spring.get());
  }, [spring, paintPosition]);

  const applyNorm = useCallback(
    (n: number) => {
      spring.jump(n);
      paintPosition(n);
      onChange(normToDb(n, min, max));
    },
    [max, min, onChange, paintPosition, spring],
  );

  const stepDb = useCallback(
    (delta: number) => {
      const next = Math.max(min, Math.min(max, value + delta));
      onChange(Math.round(next * 10) / 10);
    },
    [max, min, onChange, value],
  );

  // --- Dragging: relative, so pressing never jumps the level. Up or right
  // turns it up; Shift slows it down, re-anchored so toggling Shift mid-drag
  // doesn't jump either. ---
  const drag = useRef<{ pointerId: number; x: number; y: number; norm: number; fine: boolean } | null>(null);
  const lastPressTime = useRef(0);
  const movedDuringDrag = useRef(false);

  const clampedDefault = Math.max(min, Math.min(max, defaultDb));

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const now = performance.now();
      const isDoubleClick = now - lastPressTime.current < DOUBLE_CLICK_MS;
      lastPressTime.current = now;

      if (isDoubleClick) {
        // Timing-based for the same reason as Fader: preventDefault below
        // suppresses the events that would make a dblclick.
        applyNorm(dbToNorm(clampedDefault, min, max));
        return;
      }

      drag.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, norm: spring.get(), fine: e.shiftKey };
      movedDuringDrag.current = false;
      e.currentTarget.setPointerCapture(e.pointerId);
      e.currentTarget.focus({ preventScroll: true });
      e.preventDefault();
      isDragging.current = true;
      setActive(true);
      onDragStart();
    },
    [applyNorm, clampedDefault, max, min, onDragStart, spring],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const state = drag.current;
      if (!state || state.pointerId !== e.pointerId) return;
      if (e.shiftKey !== state.fine) {
        drag.current = { ...state, x: e.clientX, y: e.clientY, norm: spring.get(), fine: e.shiftKey };
        return;
      }
      const dx = e.clientX - state.x;
      const dy = e.clientY - state.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) movedDuringDrag.current = true;
      applyNorm(dragNorm(state.norm, dx, dy, state.fine));
    },
    [applyNorm, spring],
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
      setActive(false);
      if (movedDuringDrag.current) lastPressTime.current = 0;
      onDragEnd();
    },
    [onDragEnd],
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      // Shift+wheel arrives as horizontal scroll in Chromium.
      const delta = e.deltaY || e.deltaX;
      if (!delta) return;
      const step = e.shiftKey ? FINE_STEP_DB : WHEEL_STEP_DB;
      stepDb(delta < 0 ? step : -step);
    },
    [stepDb],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const steps: Record<string, number> = {
        ArrowUp: FINE_STEP_DB,
        ArrowRight: FINE_STEP_DB,
        ArrowDown: -FINE_STEP_DB,
        ArrowLeft: -FINE_STEP_DB,
        PageUp: WHEEL_STEP_DB,
        PageDown: -WHEEL_STEP_DB,
      };
      if (e.key in steps) {
        e.preventDefault();
        stepDb(steps[e.key]);
      } else if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        onChange(e.key === "Home" ? min : max);
      }
    },
    [max, min, onChange, stepDb],
  );

  // Muted shows on the card border, the mute button and the meter ring only;
  // the dial itself keeps showing the gain as it is.
  const meterColor = muted ? MUTED_RED : METER_COLOR;

  return (
    <div
      className="w-full h-full rounded-[6px] border border-solid flex flex-col items-center min-w-0 min-h-0 overflow-hidden"
      style={{
        borderColor: muted ? MUTED_RED : "var(--accent)",
        backgroundColor: "rgba(30, 30, 30, var(--fader-glass-tint, 0.8))",
        backdropFilter: "var(--fader-glass-filter, blur(12px) saturate(1.5))",
      }}
      onWheel={handleWheel}
    >
      <div className="flex flex-col items-center w-full h-full min-h-0 p-[clamp(3px,0.8vw,6px)] gap-[clamp(1px,0.5dvh,4px)]">
        <span className="text-[clamp(0.6rem,2.5vw,0.875rem)] font-bold text-white/90 truncate w-full text-center shrink-0 leading-tight">
          {label}
        </span>

        <span className="text-[clamp(0.55rem,2vw,0.75rem)] font-bold text-white/90 tabular-nums whitespace-nowrap shrink-0 leading-tight">
          {formatDb(value)} dB
        </span>

        {/* Dial — the whole area is the grab surface, not just the drawn knob. */}
        <div
          className="relative flex-1 min-h-0 w-full touch-none cursor-grab active:cursor-grabbing outline-none rounded-[4px] focus-visible:ring-1 focus-visible:ring-white/40"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          role="slider"
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={`${formatDb(value)} dB`}
          title={`Drag or scroll to adjust · Shift for fine · Double-click for ${formatDb(clampedDefault)} dB`}
        >
          <svg
            viewBox="0 0 100 100"
            className="absolute inset-0 w-full h-full"
            style={{
              overflow: "visible",
              filter: active ? "drop-shadow(0 0 6px rgba(var(--accent-glow-r), var(--accent-glow-g), var(--accent-glow-b), 0.7))" : undefined,
            }}
          >
            <defs>
              {/* A concave dish lit from above: the upper wall falls into
                  shadow and the lower wall catches the light (a convex knob
                  is the other way round), with a lip that does the opposite. */}
              <linearGradient id="knob-dish" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#151515" />
                <stop offset="55%" stopColor="#2c2c2c" />
                <stop offset="100%" stopColor="#4a4a4a" />
              </linearGradient>
              <linearGradient id="knob-lip" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6a6a6a" />
                <stop offset="100%" stopColor="#121212" />
              </linearGradient>
              <radialGradient id="knob-hollow" cx="50%" cy="50%" r="50%">
                <stop offset="70%" stopColor="#000" stopOpacity="0" />
                <stop offset="100%" stopColor="#000" stopOpacity="0.45" />
              </radialGradient>
            </defs>

            {/* Gain track + fill */}
            <path d={TRACK_D} fill="none" stroke="#2b2b2b" strokeWidth="10" strokeLinecap="round" />
            <path
              ref={fillRef}
              d={TRACK_D}
              pathLength={1}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeOpacity={0.5}
              style={{ strokeDasharray: "0 1", opacity: 0 }}
            />

            {/* Level-meter gutter, visible even at silence, then the live level */}
            <path
              d={METER_D}
              fill="none"
              stroke={muted ? "rgba(239,68,68,0.55)" : "rgba(255,255,255,0.14)"}
              strokeWidth="5"
              strokeLinecap="round"
            />
            <path
              ref={meterRef}
              d={METER_D}
              pathLength={1}
              fill="none"
              stroke={meterColor}
              strokeWidth="6.25"
              strokeLinecap="round"
              style={{ strokeDasharray: "0 1", opacity: 0, filter: `drop-shadow(0 0 3px ${meterColor})` }}
            />

            {/* Concave centre */}
            <circle cx={C} cy={C} r={R_DISH} fill="url(#knob-dish)" stroke="url(#knob-lip)" strokeWidth="2" />
            <circle cx={C} cy={C} r={R_DISH - 1} fill="url(#knob-hollow)" />

            {/* Needle, drawn at 0° and rotated into place */}
            <g ref={pointerRef}>
              <line
                x1={NEEDLE_IN.x}
                y1={NEEDLE_IN.y}
                x2={NEEDLE_OUT.x}
                y2={NEEDLE_OUT.y}
                stroke="white"
                strokeWidth="5"
                strokeLinecap="round"
              />
            </g>
          </svg>
        </div>

        {hasMute && (
          <div className="shrink-0">
            <MuteButton muted={muted} onToggle={() => onMuteToggle(!muted)} />
          </div>
        )}
      </div>
    </div>
  );
}

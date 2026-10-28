import { useEffect, useRef } from "react";

/**
 * Live level meter shared by faders and knobs: smooth tracking while there is
 * signal, a short hold, then a creep down at the configurable decay speed.
 * `paint` receives the 0..1 display level every animation frame; it writes to
 * the DOM directly so the meter never re-renders React.
 */
export function useLevelMeter(
  level: number,
  levelScale: number,
  meterDecay: number,
  paint: (displayLevel: number) => void,
) {
  const targetLevel = useRef(0);
  const decayRef = useRef(meterDecay);
  const paintRef = useRef(paint);

  useEffect(() => {
    targetLevel.current = level * levelScale;
  }, [level, levelScale]);

  useEffect(() => {
    decayRef.current = meterDecay;
  }, [meterDecay]);

  useEffect(() => {
    paintRef.current = paint;
  }, [paint]);

  useEffect(() => {
    let lastTime = performance.now();
    let displayLevel = 0;
    let lastSignalTime = 0;
    let raf = 0;
    const SIGNAL_THRESHOLD = 0.005;
    const HOLD_MS = 200;
    const ATTACK_SPEED = 14;
    const RELEASE_SPEED = 10;

    const animate = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      const target = targetLevel.current;
      const current = displayLevel;

      if (target > SIGNAL_THRESHOLD) {
        // Signal present — smooth exponential tracking
        lastSignalTime = now;
        const speed = target >= current ? ATTACK_SPEED : RELEASE_SPEED;
        const factor = 1 - Math.exp(-speed * dt);
        displayLevel = current + (target - current) * factor;
      } else if (now - lastSignalTime > HOLD_MS) {
        // Silence — creep down at configurable decay speed
        displayLevel = Math.max(0, current - decayRef.current * dt);
      }
      // else: within hold period, keep current level

      paintRef.current(Math.min(displayLevel, 1));
      raf = requestAnimationFrame(animate);
    };

    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, []);
}

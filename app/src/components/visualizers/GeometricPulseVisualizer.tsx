import { useRef, useEffect } from "react";

interface GeometricPulseVisualizerProps {
  opacity: number;
  intensity: number;
  masterLevel: number;
  paused?: boolean;
}

const NUM_RINGS = 6;

export default function GeometricPulseVisualizer({
  opacity,
  intensity,
  masterLevel,
  paused = false,
}: GeometricPulseVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const levelRef = useRef(masterLevel);
  const intensityRef = useRef(intensity);

  useEffect(() => { levelRef.current = masterLevel; }, [masterLevel]);
  useEffect(() => { intensityRef.current = intensity; }, [intensity]);

  useEffect(() => {
    if (paused) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let time = 0;

    const resize = () => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const drawPolygon = (
      cx: number, cy: number, radius: number,
      sides: number, rotation: number,
    ) => {
      ctx.beginPath();
      for (let i = 0; i <= sides; i++) {
        const angle = (i / sides) * Math.PI * 2 + rotation;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    };

    const animate = () => {
      const level = levelRef.current;
      const inten = intensityRef.current;
      time += 0.008 + inten * 0.005 + level * inten * 0.015;

      const w = canvas.width;
      const h = canvas.height;
      if (w === 0 || h === 0) { raf = requestAnimationFrame(animate); return; }

      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const maxRadius = Math.min(w, h) * 0.45;

      const accentR = getComputedStyle(document.documentElement)
        .getPropertyValue("--accent-r").trim() || "58";
      const accentG = getComputedStyle(document.documentElement)
        .getPropertyValue("--accent-g").trim() || "134";
      const accentB = getComputedStyle(document.documentElement)
        .getPropertyValue("--accent-b").trim() || "255";

      for (let i = 0; i < NUM_RINGS; i++) {
        const progress = (i + 1) / NUM_RINGS;
        const baseRadius = progress * maxRadius;

        // Audio pulse: rings breathe with audio
        const pulse = 1 + Math.sin(time * 2 + i * 0.8) * (0.05 + level * inten * 0.15);
        const radius = baseRadius * pulse;

        // Alternate between shapes: hex, triangle, hex...
        const sides = i % 3 === 0 ? 6 : i % 3 === 1 ? 3 : 4;

        // Rotation: each ring rotates at different speed, alternating direction
        const dir = i % 2 === 0 ? 1 : -1;
        const rotSpeed = 0.3 + inten * 0.2 + level * inten * 0.5;
        const rotation = time * rotSpeed * dir * (1 + i * 0.1);

        // Alpha: outer rings more transparent
        const alpha = (0.12 + inten * 0.1 + level * inten * 0.15) * (1 - progress * 0.5);

        ctx.strokeStyle = `rgba(${accentR},${accentG},${accentB},${alpha})`;
        ctx.lineWidth = 1 + (1 - progress) * 1.5 + level * inten * 1;

        drawPolygon(cx, cy, radius, sides, rotation);
        ctx.stroke();

        // Inner glow line at higher intensity
        if (inten > 0.3 || level > 0.2) {
          const glowAlpha = alpha * 0.3;
          ctx.strokeStyle = `rgba(${accentR},${accentG},${accentB},${glowAlpha})`;
          ctx.lineWidth = 3 + level * inten * 3;
          drawPolygon(cx, cy, radius, sides, rotation);
          ctx.stroke();
        }
      }

      // Center dot that pulses with audio
      const dotSize = 2 + inten * 2 + level * inten * 4;
      const dotAlpha = 0.3 + inten * 0.2 + level * inten * 0.3;
      ctx.fillStyle = `rgba(${accentR},${accentG},${accentB},${dotAlpha})`;
      ctx.beginPath();
      ctx.arc(cx, cy, dotSize, 0, Math.PI * 2);
      ctx.fill();

      raf = requestAnimationFrame(animate);
    };

    raf = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [paused]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ opacity }}
    />
  );
}

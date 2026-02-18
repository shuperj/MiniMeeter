import { useRef, useEffect } from "react";

interface XmbSmokeVisualizerProps {
  opacity: number;
  intensity: number;
  masterLevel: number;
  paused?: boolean;
}

const NUM_WAVES = 5;

export default function XmbSmokeVisualizer({
  opacity,
  intensity,
  masterLevel,
  paused = false,
}: XmbSmokeVisualizerProps) {
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

    const animate = () => {
      const level = levelRef.current;
      const inten = intensityRef.current;
      time += 0.006 + inten * 0.004 + level * inten * 0.02;

      const w = canvas.width;
      const h = canvas.height;
      if (w === 0 || h === 0) { raf = requestAnimationFrame(animate); return; }

      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < NUM_WAVES; i++) {
        const phase = (i / NUM_WAVES) * Math.PI * 2;
        const baseY = h * (0.35 + i * 0.08);
        const amp = h * (0.04 + inten * 0.03 + level * inten * 0.08) * (1 + i * 0.15);
        const freq = 0.003 + i * 0.001;
        const speed = time * (0.8 + i * 0.3);
        const waveAlpha = (0.08 + inten * 0.05 + level * inten * 0.1) * (1 - i * 0.12);

        // Draw the wave as a filled gradient shape
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 2) {
          const y =
            baseY +
            Math.sin(x * freq + speed + phase) * amp +
            Math.sin(x * freq * 2.3 + speed * 0.7 + phase * 1.5) * amp * 0.3 +
            Math.cos(x * freq * 0.5 + speed * 1.3) * amp * 0.2;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.closePath();

        // Gradient from accent color to transparent
        const accentR = getComputedStyle(document.documentElement)
          .getPropertyValue("--viz-r").trim() || "58";
        const accentG = getComputedStyle(document.documentElement)
          .getPropertyValue("--viz-g").trim() || "134";
        const accentB = getComputedStyle(document.documentElement)
          .getPropertyValue("--viz-b").trim() || "255";

        const gradient = ctx.createLinearGradient(0, baseY - amp, 0, h);
        gradient.addColorStop(0, `rgba(${accentR},${accentG},${accentB},${waveAlpha})`);
        gradient.addColorStop(0.4, `rgba(${accentR},${accentG},${accentB},${waveAlpha * 0.4})`);
        gradient.addColorStop(1, `rgba(${accentR},${accentG},${accentB},0)`);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Subtle top stroke
        ctx.beginPath();
        for (let x = 0; x <= w; x += 2) {
          const y =
            baseY +
            Math.sin(x * freq + speed + phase) * amp +
            Math.sin(x * freq * 2.3 + speed * 0.7 + phase * 1.5) * amp * 0.3 +
            Math.cos(x * freq * 0.5 + speed * 1.3) * amp * 0.2;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(255,255,255,${waveAlpha * 0.5})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

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

import { useRef, useEffect } from "react";

interface GradientMeshVisualizerProps {
  opacity: number;
  intensity: number;
  masterLevel: number;
  paused?: boolean;
}

interface Blob {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  phase: number;
}

const NUM_BLOBS = 5;

export default function GradientMeshVisualizer({
  opacity,
  intensity,
  masterLevel,
  paused = false,
}: GradientMeshVisualizerProps) {
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

    const blobs: Blob[] = [];
    for (let i = 0; i < NUM_BLOBS; i++) {
      blobs.push({
        x: Math.random(),
        y: Math.random(),
        vx: (Math.random() - 0.5) * 0.002,
        vy: (Math.random() - 0.5) * 0.002,
        radius: 0.2 + Math.random() * 0.15,
        phase: Math.random() * Math.PI * 2,
      });
    }

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
      time += 0.005 + inten * 0.003 + level * inten * 0.01;

      const w = canvas.width;
      const h = canvas.height;
      if (w === 0 || h === 0) { raf = requestAnimationFrame(animate); return; }

      ctx.clearRect(0, 0, w, h);

      const accentR = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue("--viz-r").trim() || "58"
      );
      const accentG = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue("--viz-g").trim() || "134"
      );
      const accentB = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue("--viz-b").trim() || "255"
      );

      // Compositing: lighter blend for overlapping glows
      ctx.globalCompositeOperation = "lighter";

      for (let i = 0; i < blobs.length; i++) {
        const blob = blobs[i];
        const speedMult = 1 + inten * 0.5 + level * inten * 2;

        // Gentle orbital motion
        blob.x += blob.vx * speedMult + Math.sin(time + blob.phase) * 0.001 * speedMult;
        blob.y += blob.vy * speedMult + Math.cos(time * 0.7 + blob.phase) * 0.001 * speedMult;

        // Bounce off edges with soft wrap
        if (blob.x < -0.1) blob.vx = Math.abs(blob.vx);
        if (blob.x > 1.1) blob.vx = -Math.abs(blob.vx);
        if (blob.y < -0.1) blob.vy = Math.abs(blob.vy);
        if (blob.y > 1.1) blob.vy = -Math.abs(blob.vy);

        const bx = blob.x * w;
        const by = blob.y * h;
        const pulse = 1 + Math.sin(time * 2 + blob.phase) * (0.1 + level * inten * 0.2);
        const br = blob.radius * Math.min(w, h) * pulse;

        // Color variation per blob
        const hueShift = i * 40;
        const r = Math.min(255, accentR + hueShift * (i % 2 === 0 ? 1 : -1));
        const g = Math.min(255, Math.max(0, accentG + (i - 2) * 20));
        const b = Math.min(255, accentB + (i % 3) * 15);
        const baseAlpha = 0.06 + inten * 0.06 + level * inten * 0.1;

        const gradient = ctx.createRadialGradient(bx, by, 0, bx, by, br);
        gradient.addColorStop(0, `rgba(${r},${g},${b},${baseAlpha})`);
        gradient.addColorStop(0.4, `rgba(${r},${g},${b},${baseAlpha * 0.6})`);
        gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);

        ctx.fillStyle = gradient;
        ctx.fillRect(bx - br, by - br, br * 2, br * 2);
      }

      ctx.globalCompositeOperation = "source-over";

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

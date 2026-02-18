import { useRef, useEffect } from "react";

interface StarfieldVisualizerProps {
  opacity: number;
  intensity: number;
  masterLevel: number;
  paused?: boolean;
}

interface Star {
  x: number;
  y: number;
  z: number;
}

const MAX_STARS = 300;

export default function StarfieldVisualizer({
  opacity,
  intensity,
  masterLevel,
  paused = false,
}: StarfieldVisualizerProps) {
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

    const stars: Star[] = [];
    for (let i = 0; i < MAX_STARS; i++) {
      stars.push({
        x: (Math.random() - 0.5) * 2,
        y: (Math.random() - 0.5) * 2,
        z: Math.random(),
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
      const w = canvas.width;
      const h = canvas.height;
      if (w === 0 || h === 0) { raf = requestAnimationFrame(animate); return; }

      const cx = w / 2;
      const cy = h / 2;

      // Speed: base + intensity + audio*intensity
      const speed = 0.002 + inten * 0.003 + level * inten * 0.012;

      ctx.fillStyle = "rgba(0,0,0,0.15)";
      ctx.fillRect(0, 0, w, h);

      const accentR = getComputedStyle(document.documentElement)
        .getPropertyValue("--viz-r").trim() || "58";
      const accentG = getComputedStyle(document.documentElement)
        .getPropertyValue("--viz-g").trim() || "134";
      const accentB = getComputedStyle(document.documentElement)
        .getPropertyValue("--viz-b").trim() || "255";

      for (const star of stars) {
        star.z -= speed;

        if (star.z <= 0.001) {
          star.x = (Math.random() - 0.5) * 2;
          star.y = (Math.random() - 0.5) * 2;
          star.z = 1;
        }

        const sx = cx + (star.x / star.z) * cx;
        const sy = cy + (star.y / star.z) * cy;

        if (sx < 0 || sx > w || sy < 0 || sy > h) {
          star.x = (Math.random() - 0.5) * 2;
          star.y = (Math.random() - 0.5) * 2;
          star.z = 1;
          continue;
        }

        const depth = 1 - star.z;
        const size = depth * (1.5 + level * inten * 2);
        const alpha = depth * (0.5 + inten * 0.3 + level * inten * 0.3);

        // Near stars get accent tint, far stars stay white
        if (depth > 0.6) {
          ctx.fillStyle = `rgba(${accentR},${accentG},${accentB},${alpha})`;
        } else {
          ctx.fillStyle = `rgba(255,255,255,${alpha * 0.7})`;
        }

        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(0.5, size), 0, Math.PI * 2);
        ctx.fill();

        // Streak line for fast-moving stars
        if (speed > 0.006 && depth > 0.3) {
          const prevZ = star.z + speed;
          const prevSx = cx + (star.x / prevZ) * cx;
          const prevSy = cy + (star.y / prevZ) * cy;
          ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.3})`;
          ctx.lineWidth = Math.max(0.3, size * 0.5);
          ctx.beginPath();
          ctx.moveTo(prevSx, prevSy);
          ctx.lineTo(sx, sy);
          ctx.stroke();
        }
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

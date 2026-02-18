import { useRef, useEffect } from "react";

interface NoiseFlowVisualizerProps {
  opacity: number;
  intensity: number;
  masterLevel: number;
  paused?: boolean;
}

interface Particle {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  life: number;
}

const MAX_PARTICLES = 400;

// Simple hash-based noise for flow field (fast, no dependency)
function noise2d(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function smoothNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const n00 = noise2d(ix, iy);
  const n10 = noise2d(ix + 1, iy);
  const n01 = noise2d(ix, iy + 1);
  const n11 = noise2d(ix + 1, iy + 1);
  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

export default function NoiseFlowVisualizer({
  opacity,
  intensity,
  masterLevel,
  paused = false,
}: NoiseFlowVisualizerProps) {
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

    const particles: Particle[] = [];
    const spawn = () => ({
      x: Math.random(),
      y: Math.random(),
      prevX: 0,
      prevY: 0,
      life: 0.5 + Math.random() * 0.5,
    });

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = spawn();
      p.prevX = p.x;
      p.prevY = p.y;
      particles.push(p);
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

      time += 0.003 + inten * 0.002 + level * inten * 0.008;

      // Fade trail
      ctx.fillStyle = "rgba(0,0,0,0.04)";
      ctx.fillRect(0, 0, w, h);

      const accentR = getComputedStyle(document.documentElement)
        .getPropertyValue("--viz-r").trim() || "58";
      const accentG = getComputedStyle(document.documentElement)
        .getPropertyValue("--viz-g").trim() || "134";
      const accentB = getComputedStyle(document.documentElement)
        .getPropertyValue("--viz-b").trim() || "255";

      const noiseScale = 3 + inten * 1 + level * inten * 2;
      const particleSpeed = 0.003 + inten * 0.002 + level * inten * 0.008;

      for (const p of particles) {
        p.prevX = p.x;
        p.prevY = p.y;

        // Flow field angle from noise
        const angle = smoothNoise(p.x * noiseScale + time * 5, p.y * noiseScale + time * 3) * Math.PI * 4;

        p.x += Math.cos(angle) * particleSpeed;
        p.y += Math.sin(angle) * particleSpeed;
        p.life -= 0.002;

        // Reset if out of bounds or dead
        if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1 || p.life <= 0) {
          const np = spawn();
          p.x = np.x;
          p.y = np.y;
          p.prevX = p.x;
          p.prevY = p.y;
          p.life = np.life;
          continue;
        }

        const alpha = p.life * (0.15 + inten * 0.15 + level * inten * 0.2);

        ctx.strokeStyle = `rgba(${accentR},${accentG},${accentB},${alpha})`;
        ctx.lineWidth = 0.8 + level * inten * 1;
        ctx.beginPath();
        ctx.moveTo(p.prevX * w, p.prevY * h);
        ctx.lineTo(p.x * w, p.y * h);
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

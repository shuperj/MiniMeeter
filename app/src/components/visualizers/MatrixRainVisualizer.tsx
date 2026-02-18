import { useRef, useEffect } from "react";

interface MatrixRainVisualizerProps {
  opacity: number;
  intensity: number;
  masterLevel: number;
  paused?: boolean;
}

interface Column {
  x: number;
  y: number;
  speed: number;
  chars: string[];
  length: number;
}

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789";

function randomChar() {
  return CHARS[Math.floor(Math.random() * CHARS.length)];
}

export default function MatrixRainVisualizer({
  opacity,
  intensity,
  masterLevel,
  paused = false,
}: MatrixRainVisualizerProps) {
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
    let columns: Column[] = [];
    let lastW = 0;

    const fontSize = 12;
    const colWidth = fontSize * 0.8;

    const initColumns = (w: number, h: number) => {
      const numCols = Math.ceil(w / colWidth);
      columns = [];
      for (let i = 0; i < numCols; i++) {
        if (Math.random() < 0.6) {
          const length = 5 + Math.floor(Math.random() * 15);
          const chars: string[] = [];
          for (let j = 0; j < length; j++) chars.push(randomChar());
          columns.push({
            x: i * colWidth,
            y: -Math.random() * h,
            speed: 1 + Math.random() * 2,
            chars,
            length,
          });
        }
      }
    };

    const resize = () => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      if (canvas.width !== lastW) {
        lastW = canvas.width;
        initColumns(canvas.width, canvas.height);
      }
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

      // Fade effect
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      ctx.fillRect(0, 0, w, h);

      const accentR = getComputedStyle(document.documentElement)
        .getPropertyValue("--accent-r").trim() || "58";
      const accentG = getComputedStyle(document.documentElement)
        .getPropertyValue("--accent-g").trim() || "134";
      const accentB = getComputedStyle(document.documentElement)
        .getPropertyValue("--accent-b").trim() || "255";

      const speedMult = 1 + inten * 0.5 + level * inten * 3;

      ctx.font = `${fontSize}px monospace`;

      for (const col of columns) {
        col.y += col.speed * speedMult;

        // Occasionally mutate a random char
        if (Math.random() < 0.03 + level * inten * 0.05) {
          const idx = Math.floor(Math.random() * col.chars.length);
          col.chars[idx] = randomChar();
        }

        for (let j = 0; j < col.chars.length; j++) {
          const charY = col.y - j * fontSize;
          if (charY < -fontSize || charY > h + fontSize) continue;

          const headDist = j / col.chars.length;
          if (j === 0) {
            // Head char — bright accent
            const a = 0.8 + level * inten * 0.2;
            ctx.fillStyle = `rgba(${accentR},${accentG},${accentB},${a})`;
          } else if (j < 3) {
            // Near head — lighter
            const a = (0.5 + inten * 0.2) * (1 - headDist * 0.3);
            ctx.fillStyle = `rgba(${accentR},${accentG},${accentB},${a})`;
          } else {
            // Tail — fade to dim
            const a = (0.2 + inten * 0.1) * (1 - headDist);
            ctx.fillStyle = `rgba(${accentR},${accentG},${accentB},${a * 0.6})`;
          }

          ctx.fillText(col.chars[j], col.x, charY);
        }

        // Reset when off screen
        if (col.y - col.chars.length * fontSize > h) {
          col.y = -Math.random() * h * 0.5;
          col.speed = 1 + Math.random() * 2;
          const newLen = 5 + Math.floor(Math.random() * 15);
          col.chars = [];
          for (let j = 0; j < newLen; j++) col.chars.push(randomChar());
        }
      }

      // Audio-reactive: spawn extra columns
      if (level * inten > 0.3 && Math.random() < level * inten * 0.1) {
        const x = Math.random() * w;
        const length = 5 + Math.floor(Math.random() * 10);
        const chars: string[] = [];
        for (let j = 0; j < length; j++) chars.push(randomChar());
        columns.push({ x, y: 0, speed: 2 + Math.random() * 2, chars, length });
        // Cap total columns
        if (columns.length > 80) columns.shift();
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

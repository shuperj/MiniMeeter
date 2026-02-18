import { useRef, useEffect } from "react";

interface PlasmaVisualizerProps {
  opacity: number;
  intensity: number;
  masterLevel: number;
  paused?: boolean;
}

export default function PlasmaVisualizer({
  opacity,
  intensity,
  masterLevel,
  paused = false,
}: PlasmaVisualizerProps) {
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
    let imgData: ImageData | null = null;

    const resize = () => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      imgData = null;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const animate = () => {
      const level = levelRef.current;
      const inten = intensityRef.current;
      time += 0.015 + inten * 0.01 + level * inten * 0.04;

      const w = canvas.width;
      const h = canvas.height;
      if (w === 0 || h === 0) { raf = requestAnimationFrame(animate); return; }

      // Render at half resolution for performance
      const scale = 2;
      const pw = Math.ceil(w / scale);
      const ph = Math.ceil(h / scale);

      if (!imgData || imgData.width !== pw || imgData.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
        canvas.style.imageRendering = "auto";
        imgData = ctx.createImageData(pw, ph);
      }

      const accentR = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue("--accent-r").trim() || "58"
      );
      const accentG = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue("--accent-g").trim() || "134"
      );
      const accentB = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue("--accent-b").trim() || "255"
      );

      const data = imgData.data;
      const distortion = 1 + level * inten * 2;

      for (let y = 0; y < ph; y++) {
        for (let x = 0; x < pw; x++) {
          const nx = x / pw;
          const ny = y / ph;

          // Classic plasma: sum of sines at different frequencies
          const v1 = Math.sin(nx * 6 * distortion + time);
          const v2 = Math.sin(ny * 8 * distortion + time * 0.7);
          const v3 = Math.sin((nx + ny) * 5 + time * 0.5);
          const v4 = Math.sin(Math.sqrt((nx - 0.5) ** 2 + (ny - 0.5) ** 2) * 12 + time * 1.3);
          const v = (v1 + v2 + v3 + v4) / 4; // -1 to 1

          // Map to color palette based on accent color
          const t = (v + 1) / 2; // 0 to 1

          // Smooth color cycling through accent + complementary
          const r = Math.floor(accentR * (0.3 + 0.7 * Math.sin(t * Math.PI)));
          const g = Math.floor(accentG * (0.3 + 0.7 * Math.sin(t * Math.PI + 0.5)));
          const b = Math.floor(accentB * (0.3 + 0.7 * Math.sin(t * Math.PI + 1.0)));
          const a = Math.floor((80 + inten * 60 + level * inten * 80) * (0.6 + t * 0.4));

          const idx = (y * pw + x) * 4;
          data[idx] = Math.min(255, r);
          data[idx + 1] = Math.min(255, g);
          data[idx + 2] = Math.min(255, b);
          data[idx + 3] = Math.min(255, a);
        }
      }

      ctx.putImageData(imgData, 0, 0);
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
      style={{ opacity, width: "100%", height: "100%" }}
    />
  );
}

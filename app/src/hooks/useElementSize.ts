import { useEffect, useState, type RefObject } from "react";

/** Content-box size of an element, kept current with a ResizeObserver. */
export function useElementSize(ref: RefObject<HTMLElement | null>, enabled = true): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, enabled]);

  return size;
}

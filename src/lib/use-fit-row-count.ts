"use client";

import { useEffect, useRef, useState } from "react";

type Options = {
  chromeHeight: number;
  rowHeight: number;
  candidates?: number[];
  fallback?: number;
};

export function useFitRowCount({
  chromeHeight,
  rowHeight,
  candidates,
  fallback = 3,
}: Options) {
  const ref = useRef<HTMLDivElement>(null);
  const [rowCount, setRowCount] = useState(fallback);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const measure = () => {
      if (rowHeight <= 0) {
        setRowCount(fallback);
        return;
      }

      // When candidates are omitted, fit as many full rows as possible.
      if (!candidates || candidates.length === 0) {
        const totalHeight = element.clientHeight;
        const available = totalHeight - chromeHeight;
        // If chrome estimate overshoots, still use full container height.
        const fitHeight = available > 0 ? available : totalHeight;
        setRowCount(Math.max(1, Math.floor(fitHeight / rowHeight)));
        return;
      }

      const available = element.clientHeight - chromeHeight;
      if (available <= 0) {
        setRowCount(fallback);
        return;
      }

      let best = fallback;
      for (const candidate of candidates) {
        if (candidate * rowHeight <= available) {
          best = candidate;
        }
      }
      setRowCount(best);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [chromeHeight, rowHeight, candidates, fallback]);

  return { ref, rowCount };
}

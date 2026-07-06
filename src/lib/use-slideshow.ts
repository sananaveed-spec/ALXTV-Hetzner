"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Options = {
  count: number;
  slideMs: number;
  autoplayEnabled?: boolean;
  syncTick?: number;
  onCycleComplete?: () => void;
};

export function useSlideshow({
  count,
  slideMs,
  autoplayEnabled = true,
  syncTick,
  onCycleComplete,
}: Options) {
  const [index, setIndex] = useState(0);
  const [timerEpoch, setTimerEpoch] = useState(0);
  const countRef = useRef(count);
  const prevIndexRef = useRef<number | null>(null);
  const lastSyncTickRef = useRef<number | null>(null);

  useEffect(() => {
    countRef.current = count;
  }, [count]);

  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, count - 1)));
  }, [count]);

  useEffect(() => {
    if (!autoplayEnabled || count <= 1) {
      prevIndexRef.current = index;
      return;
    }
    if (
      prevIndexRef.current !== null &&
      prevIndexRef.current === count - 1 &&
      index === 0
    ) {
      onCycleComplete?.();
    }
    prevIndexRef.current = index;
  }, [index, count, autoplayEnabled, onCycleComplete]);

  const advance = useCallback(() => {
    setIndex((current) => {
      const n = countRef.current;
      if (n <= 1) {
        return 0;
      }
      return (current + 1) % n;
    });
  }, []);

  const goPrev = useCallback(() => {
    if (count <= 1) {
      return;
    }
    setIndex((i) => (i - 1 + count) % count);
    setTimerEpoch((e) => e + 1);
  }, [count]);

  const goNext = useCallback(() => {
    if (count <= 1) {
      return;
    }
    advance();
    setTimerEpoch((e) => e + 1);
  }, [count, advance]);

  useEffect(() => {
    if (!autoplayEnabled || count <= 1) {
      return;
    }
    if (typeof syncTick === "number") {
      return;
    }

    let cancelled = false;
    let timeoutId = 0;

    const scheduleNext = () => {
      timeoutId = window.setTimeout(() => {
        if (cancelled) {
          return;
        }
        advance();
        scheduleNext();
      }, slideMs);
    };

    scheduleNext();

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [count, slideMs, advance, autoplayEnabled, syncTick, timerEpoch]);

  useEffect(() => {
    if (typeof syncTick !== "number") {
      return;
    }
    if (count <= 1) {
      lastSyncTickRef.current = syncTick;
      return;
    }
    if (lastSyncTickRef.current === null) {
      lastSyncTickRef.current = syncTick;
      return;
    }
    if (syncTick === lastSyncTickRef.current) {
      return;
    }
    lastSyncTickRef.current = syncTick;
    setTimerEpoch((e) => e + 1);
    advance();
  }, [syncTick, count, advance]);

  return { index, goPrev, goNext, timerEpoch };
}

"use client";

import { UNDER_HOURS_ROTATE_MS } from "@/clockify/lib/kiosk-timing";
import { EngineerSlot } from "@/components/engineer-load-board";
import { DEFAULT_SLIDE_MS } from "@/lib/kiosk-timing";
import type { EngineerLoadBoard } from "@/lib/engineer-load-parse";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Props = {
  boards: EngineerLoadBoard[];
  /** Time each lead is visible (default 30s). */
  slideMs?: number;
  syncTick?: number;
  onSlideMetaChange?: (meta: {
    index: number;
    count: number;
    name: string;
  }) => void;
  /** When set, called instead of router.refresh() after a full carousel cycle. */
  onCycleComplete?: () => void;
};

function EmptyBoards() {
  return (
    <section className="engineerBoard engineerBoardEmpty">
      <p>No engineers found.</p>
      <p className="hint">
        Each lead uses 3 side-by-side columns: row 1 = name, row 2 = headings, row 3+
        = data until a row is blank in all three cells. The next lead is detected on
        the next column where row 1 has any text (so blocks can start at T:U:V, not
        only A:C, D:F, …).
      </p>
    </section>
  );
}

function SliderTopProgress({
  count,
  index,
  durationMs,
}: {
  count: number;
  index: number;
  durationMs: number;
}) {
  if (count < 2) {
    return null;
  }

  return (
    <div
      className="engineerSliderTopProgress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={0}
      aria-label={`Slide ${index + 1} of ${count}`}
    >
      <div className="engineerSliderTopProgressTrack">
        <div
          key={`${index}-${durationMs}`}
          className="engineerSliderTopProgressFill"
          style={{ animationDuration: `${durationMs}ms` }}
        />
      </div>
    </div>
  );
}

export default function EngineerLoadSlider({
  boards,
  slideMs,
  syncTick,
  onSlideMetaChange,
  onCycleComplete,
}: Props) {
  const router = useRouter();
  const safeSlideMs = useMemo(() => {
    const n = Number(slideMs ?? DEFAULT_SLIDE_MS);
    return Number.isFinite(n) && n >= 2000 ? n : DEFAULT_SLIDE_MS;
  }, [slideMs]);

  const count = boards.length;
  const [index, setIndex] = useState(0);
  const countRef = useRef(count);

  useEffect(() => {
    countRef.current = count;
  }, [count]);

  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, count - 1)));
  }, [count]);

  useEffect(() => {
    onSlideMetaChange?.({
      index,
      count,
      name: boards[index]?.name?.trim() ?? "",
    });
  }, [index, count, boards, onSlideMetaChange]);

  const prevIndexRef = useRef<number | null>(null);

  useEffect(() => {
    if (count <= 1) {
      prevIndexRef.current = index;
      return;
    }
    if (
      prevIndexRef.current !== null &&
      prevIndexRef.current === count - 1 &&
      index === 0
    ) {
      if (onCycleComplete) {
        onCycleComplete();
      } else {
        router.refresh();
      }
    }
    prevIndexRef.current = index;
  }, [index, count, router, onCycleComplete]);

  const advanceSlide = useCallback(() => {
    setIndex((currentIndex) => {
      const leadCount = countRef.current;
      if (leadCount <= 1) {
        return 0;
      }
      return (currentIndex + 1) % leadCount;
    });
  }, []);

  useEffect(() => {
    if (count <= 1) {
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
        advanceSlide();
        scheduleNext();
      }, safeSlideMs);
    };

    scheduleNext();

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [count, safeSlideMs, advanceSlide, syncTick]);

  const lastSyncTickRef = useRef<number | null>(null);

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
    advanceSlide();
  }, [syncTick, count, advanceSlide]);

  if (count === 0) {
    return <EmptyBoards />;
  }

  const current = boards[index]!;
  const progressDurationMs =
    typeof syncTick === "number" ? UNDER_HOURS_ROTATE_MS : safeSlideMs;

  return (
    <div className="engineerSlider">
      <SliderTopProgress
        count={count}
        index={index}
        durationMs={progressDurationMs}
      />
      <EngineerSlot key={`${index}-${current.name}`} board={current} />
    </div>
  );
}

"use client";

import { UNDER_HOURS_ROTATE_MS } from "@/clockify/lib/kiosk-timing";
import { EngineerSlot } from "@/components/engineer-load-board";
import SlideshowNav from "@/components/slideshow-nav";
import { DEFAULT_SLIDE_MS } from "@/lib/kiosk-timing";
import type { EngineerLoadBoard } from "@/lib/engineer-load-parse";
import { useSlideshow } from "@/lib/use-slideshow";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";

type Props = {
  boards: EngineerLoadBoard[];
  slideMs?: number;
  syncTick?: number;
  onSlideMetaChange?: (meta: {
    index: number;
    count: number;
    name: string;
  }) => void;
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
  const progressMs =
    typeof syncTick === "number" ? UNDER_HOURS_ROTATE_MS : safeSlideMs;

  const { index, goPrev, goNext, timerEpoch } = useSlideshow({
    count,
    slideMs: progressMs,
    syncTick,
    onCycleComplete: onCycleComplete ?? (() => router.refresh()),
  });

  useEffect(() => {
    onSlideMetaChange?.({
      index,
      count,
      name: boards[index]?.name?.trim() ?? "",
    });
  }, [index, count, boards, onSlideMetaChange]);

  if (count === 0) {
    return <EmptyBoards />;
  }

  const current = boards[index]!;

  return (
    <div className="engineerSlider">
      <SlideshowNav
        index={index}
        count={count}
        slideMs={progressMs}
        onPrev={goPrev}
        onNext={goNext}
        progressKey={`${index}-${timerEpoch}`}
        compact
      />
      <EngineerSlot key={`${index}-${current.name}`} board={current} />
    </div>
  );
}

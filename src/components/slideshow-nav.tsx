"use client";

import { type CSSProperties } from "react";
import styles from "./slideshow-nav.module.css";

type Props = {
  index: number;
  count: number;
  slideMs: number;
  onPrev: () => void;
  onNext: () => void;
  /** Restarts the inline progress animation after manual navigation. */
  progressKey?: string | number;
  compact?: boolean;
  /** `inline`: progress bar and counter on one row between prev/next. */
  layout?: "stacked" | "inline";
  className?: string;
};

export default function SlideshowNav({
  index,
  count,
  slideMs,
  onPrev,
  onNext,
  progressKey,
  compact = false,
  layout = "stacked",
  className,
}: Props) {
  if (count < 2) {
    return null;
  }

  const inline = layout === "inline";

  return (
    <div
      className={`${styles.meta} ${compact ? styles.compact : ""} ${inline ? styles.inline : ""} ${className ?? ""}`}
    >
      <button
        type="button"
        className={styles.navBtn}
        onClick={onPrev}
        aria-label="Previous slide"
      >
        {"<"}
      </button>
      <div className={inline ? styles.centerInline : styles.center}>
        <div
          className={styles.progressTrack}
          aria-hidden
          key={progressKey ?? index}
          style={{ "--slide-ms": `${slideMs}ms` } as CSSProperties}
        >
          <div className={styles.progressFill} />
        </div>
        <span className={styles.counter}>
          {index + 1} / {count}
        </span>
      </div>
      <button
        type="button"
        className={styles.navBtn}
        onClick={onNext}
        aria-label="Next slide"
      >
        {">"}
      </button>
    </div>
  );
}

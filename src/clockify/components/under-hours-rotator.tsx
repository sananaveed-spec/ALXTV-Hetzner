"use client";

import styles from "@/clockify/components/under-hours-rotator.module.css";
import { UNDER_HOURS_ROTATE_MS } from "@/clockify/lib/kiosk-timing";
import { isAllowlistPlaceholderUserId } from "@/clockify/lib/employee-exclusions";
import type { EmployeeWeekdaySlide } from "@/clockify/lib/under-hours";
import { useEffect, useRef, useState } from "react";

const ROTATE_MS = UNDER_HOURS_ROTATE_MS;

function formatHours(seconds: number): string {
  return `${(seconds / 3600).toFixed(2)}h`;
}

function SlideshowProgressBar({
  slideCount,
  activeIndex,
  durationMs,
  shouldAnimate,
}: {
  slideCount: number;
  activeIndex: number;
  durationMs: number;
  shouldAnimate: boolean;
}) {
  if (slideCount < 2) {
    return null;
  }

  return (
    <div
      className={styles.slideshowBar}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={shouldAnimate ? 0 : 100}
      aria-label={`Slide ${activeIndex + 1} of ${slideCount}`}
    >
      <div className={styles.slideshowBarTrack}>
        <div
          key={shouldAnimate ? `${activeIndex}-${durationMs}` : "static"}
          className={`${styles.slideshowBarFill} ${
            shouldAnimate
              ? styles.slideshowBarFillActive
              : styles.slideshowBarFillComplete
          }`}
          style={
            shouldAnimate ? { animationDuration: `${durationMs}ms` } : undefined
          }
        />
      </div>
    </div>
  );
}

export default function UnderHoursRotator({
  slides,
  onCycleComplete,
  compact = false,
  autoplayEnabled = true,
  syncTick,
}: {
  slides: EmployeeWeekdaySlide[];
  /** Fires after the last slide has been shown and the rotator wraps to the first. */
  onCycleComplete?: () => void;
  compact?: boolean;
  autoplayEnabled?: boolean;
  syncTick?: number;
}) {
  const [index, setIndex] = useState(0);
  const n = slides.length;
  const prevIndexRef = useRef<number | null>(null);

  useEffect(() => {
    setIndex((i) => (n > 0 ? Math.min(i, n - 1) : 0));
  }, [n]);

  useEffect(() => {
    if (!autoplayEnabled || n <= 1) {
      prevIndexRef.current = index;
      return;
    }
    if (
      prevIndexRef.current !== null &&
      prevIndexRef.current === n - 1 &&
      index === 0
    ) {
      onCycleComplete?.();
    }
    prevIndexRef.current = index;
  }, [index, n, autoplayEnabled, onCycleComplete]);

  useEffect(() => {
    if (!autoplayEnabled || n <= 1) {
      return;
    }
    if (typeof syncTick === "number") {
      return;
    }
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % n);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [n, autoplayEnabled, syncTick]);

  const lastSyncTickRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof syncTick !== "number") {
      return;
    }
    if (n <= 1) {
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
    setIndex((i) => (i + 1) % n);
  }, [syncTick, n]);

  if (n === 0) {
    return (
      <section className={styles.section}>
        <div className={styles.header}>
          <h2>Last 7 Days Reported Hours</h2>
          <p className={styles.sub}>
            No team members in this workspace for the rotating view.
          </p>
        </div>
      </section>
    );
  }

  const current = slides[index]!;
  const shouldAnimate =
    n > 1 && (autoplayEnabled || typeof syncTick === "number");

  return (
    <section
      className={`${styles.section} ${styles.rotator} ${compact ? styles.compact : ""}`}
    >
      <SlideshowProgressBar
        slideCount={n}
        activeIndex={index}
        durationMs={ROTATE_MS}
        shouldAnimate={shouldAnimate}
      />
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <h2>Last 7 Days Reported Hours</h2>
          <span className={styles.counter}>
            {index + 1} / {n}
          </span>
        </div>
        {!compact ? (
          <p className={styles.sub}>
            Weekday hours in the last 7 days (workspace timezone). Auto-advances
            every {ROTATE_MS / 1000} seconds.
          </p>
        ) : null}
      </div>

      <div className={styles.body}>
        <div className={styles.slide}>
          <h3 className={styles.name}>
            {current.name}
            {isAllowlistPlaceholderUserId(current.userId) ? (
              <span className={styles.pendingTag}> · Not in Clockify yet</span>
            ) : null}
          </h3>
          <ul className={styles.slotList}>
            {current.slots.map((slot) => {
              const pct = Math.min(
                100,
                (slot.seconds / Math.max(slot.targetSeconds, 1)) * 100,
              );
              return (
                <li
                  key={slot.dateKey}
                  className={
                    slot.underTarget
                      ? `${styles.slot} ${styles.slotWarn}`
                      : styles.slot
                  }
                >
                  <div className={styles.slotHead}>
                    <span className={styles.slotDate}>{slot.dateLabel}</span>
                    <span className={styles.slotHours}>
                      <strong>{formatHours(slot.seconds)}</strong>
                      <span className={styles.slash}> / </span>
                      <span>{formatHours(slot.targetSeconds)}</span>
                    </span>
                  </div>
                  <div
                    className={styles.barTrack}
                    role="img"
                    aria-label={`${slot.dateLabel}: ${formatHours(slot.seconds)} of ${formatHours(slot.targetSeconds)}`}
                  >
                    <div
                      className={
                        slot.underTarget
                          ? styles.barFill
                          : `${styles.barFill} ${styles.barOk}`
                      }
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}

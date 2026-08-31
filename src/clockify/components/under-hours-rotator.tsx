"use client";

import styles from "@/clockify/components/under-hours-rotator.module.css";
import { UNDER_HOURS_ROTATE_MS } from "@/clockify/lib/kiosk-timing";
import { isAllowlistPlaceholderUserId } from "@/clockify/lib/employee-exclusions";
import type { EmployeeWeekdaySlide } from "@/clockify/lib/under-hours";
import SlideshowNav from "@/components/slideshow-nav";
import { useSlideshow } from "@/lib/use-slideshow";

const ROTATE_MS = UNDER_HOURS_ROTATE_MS;

function formatHours(seconds: number): string {
  return `${(seconds / 3600).toFixed(2)}h`;
}

export default function UnderHoursRotator({
  slides,
  compact = false,
  autoplayEnabled = true,
  syncTick,
  onCycleComplete,
}: {
  slides: EmployeeWeekdaySlide[];
  compact?: boolean;
  autoplayEnabled?: boolean;
  syncTick?: number;
  onCycleComplete?: () => void;
}) {
  const n = slides.length;

  const { index, goPrev, goNext, timerEpoch } = useSlideshow({
    count: n,
    slideMs: ROTATE_MS,
    autoplayEnabled,
    syncTick,
    onCycleComplete,
  });

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

  return (
    <section
      className={`${styles.section} ${styles.rotator} ${compact ? styles.compact : ""}`}
    >
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <h2>Last 7 Days Reported Hours</h2>
        </div>
        <SlideshowNav
          index={index}
          count={n}
          slideMs={ROTATE_MS}
          onPrev={goPrev}
          onNext={goNext}
          progressKey={`${index}-${timerEpoch}`}
          compact={compact}
          className={styles.slideshowNav}
        />
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
              <span className={styles.pendingTag}> · Not in Timesheets yet</span>
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

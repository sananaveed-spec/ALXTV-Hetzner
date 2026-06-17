"use client";

import type { ProjectHoursRow } from "@/clockify/lib/project-hours";
import { UNDER_HOURS_ROTATE_MS } from "@/clockify/lib/kiosk-timing";
import { useFitRowCount } from "@/lib/use-fit-row-count";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./projects-table.module.css";

const DEFAULT_ROWS_PER_PAGE = 10;
/** Compact thead + panel padding consumed when measuring body height. */
const TV_TABLE_CHROME_PX = 38;
const ROTATE_MS = UNDER_HOURS_ROTATE_MS;

type Props = {
  rows: ProjectHoursRow[];
  compact?: boolean;
  fillContainer?: boolean;
  autoplayEnabled?: boolean;
  syncTick?: number;
  /** Bumped when the project rotator phase begins (restarts slide 1 progress). */
  phaseEpoch?: number;
  onCycleComplete?: () => void;
};

function formatHours(seconds: number): string {
  return `${(seconds / 3600).toFixed(2)}h`;
}

function formatPercentage(trackedSeconds: number, estimateSeconds: number): string {
  if (estimateSeconds <= 0) {
    return "—";
  }
  const pct = (trackedSeconds / estimateSeconds) * 100;
  return `${Math.round(pct)}%`;
}

function chunkRows(rows: ProjectHoursRow[], pageSize: number): ProjectHoursRow[][] {
  const pages: ProjectHoursRow[][] = [];
  for (let i = 0; i < rows.length; i += pageSize) {
    pages.push(rows.slice(i, i + pageSize));
  }
  return pages;
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
          style={shouldAnimate ? { animationDuration: `${durationMs}ms` } : undefined}
        />
      </div>
    </div>
  );
}

export default function ProjectsTable({
  rows,
  compact = false,
  fillContainer = false,
  autoplayEnabled = false,
  syncTick,
  phaseEpoch = 0,
  onCycleComplete,
}: Props) {
  const { ref: fillRef, rowCount: fitRowCount } = useFitRowCount({
    chromeHeight: fillContainer ? TV_TABLE_CHROME_PX : 0,
    rowHeight: compact ? 30 : 40,
    fallback: compact ? 7 : DEFAULT_ROWS_PER_PAGE,
  });

  const rowsPerPage = fillContainer ? fitRowCount : DEFAULT_ROWS_PER_PAGE;
  const pages = useMemo(() => chunkRows(rows, rowsPerPage), [rows, rowsPerPage]);
  const [index, setIndex] = useState(0);
  const n = pages.length;
  const lastSyncTickRef = useRef<number | null>(null);
  const prevIndexRef = useRef<number | null>(null);

  const slideClockKey = `${phaseEpoch}-${index}-${rowsPerPage}`;

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

    const advanceTimer = window.setTimeout(() => {
      setIndex((current) => (current + 1) % n);
    }, ROTATE_MS);

    return () => {
      window.clearTimeout(advanceTimer);
    };
  }, [slideClockKey, autoplayEnabled, n, syncTick]);

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
    setIndex((current) => (current + 1) % n);
  }, [syncTick, n]);

  useEffect(() => {
    if (!autoplayEnabled || n !== 1) {
      return;
    }
    const id = window.setTimeout(() => {
      onCycleComplete?.();
    }, ROTATE_MS);
    return () => window.clearTimeout(id);
  }, [slideClockKey, autoplayEnabled, n, onCycleComplete]);

  useEffect(() => {
    if (!autoplayEnabled || n !== 0) {
      return;
    }
    const id = window.setTimeout(() => {
      onCycleComplete?.();
    }, ROTATE_MS);
    return () => window.clearTimeout(id);
  }, [slideClockKey, autoplayEnabled, n, onCycleComplete]);

  const currentRows = pages[index] ?? [];
  const shouldAnimate =
    n > 1 && (autoplayEnabled || typeof syncTick === "number");

  return (
    <section
      className={`${styles.section} ${styles.rotator} ${compact ? styles.compact : ""} ${fillContainer ? styles.fillContainer : ""}`}
    >
      <SlideshowProgressBar
        slideCount={n}
        activeIndex={index}
        durationMs={ROTATE_MS}
        shouldAnimate={shouldAnimate}
      />
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <h2>Project Performance</h2>
          {n > 0 ? (
            <span className={styles.counter}>
              {index + 1} / {n}
            </span>
          ) : null}
        </div>
        {!fillContainer ? (
          <p className={styles.sub}>
            Project name, assign hours, actual hours, and completion % from Clockify.{" "}
            {n > 1
              ? `Showing ${rowsPerPage} projects per page. Auto-advances every ${ROTATE_MS / 1000} seconds.`
              : rows.length > 0
                ? `Showing up to ${rowsPerPage} projects.`
                : null}
          </p>
        ) : null}
      </div>
      {rows.length > 0 && n > 0 ? (
        <>
          <div
            ref={fillContainer ? fillRef : undefined}
            className={styles.body}
          >
            <div className={styles.tablePanel}>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Project Name</th>
                      <th>Assign Hours</th>
                      <th>Actual Hours</th>
                      <th>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentRows.map((row) => (
                      <tr key={row.projectId}>
                        <td>{row.name}</td>
                        <td>{formatHours(row.estimateSeconds)}</td>
                        <td>{formatHours(row.trackedSeconds)}</td>
                        <td>
                          {formatPercentage(row.trackedSeconds, row.estimateSeconds)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div
          ref={fillContainer ? fillRef : undefined}
          className={styles.tableWrap}
        >
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Project Name</th>
                <th>Assign Hours</th>
                <th>Actual Hours</th>
                <th>%</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={4} className={styles.empty}>
                  No active projects found in this workspace.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

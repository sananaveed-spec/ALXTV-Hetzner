"use client";

import type { ProjectHoursRow } from "@/clockify/lib/project-hours";
import { UNDER_HOURS_ROTATE_MS } from "@/clockify/lib/kiosk-timing";
import SlideshowNav from "@/components/slideshow-nav";
import { useFitRowCount } from "@/lib/use-fit-row-count";
import { useSlideshow } from "@/lib/use-slideshow";
import { useEffect, useMemo, useState } from "react";
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
  onCycleComplete?: () => void;
};

function formatHours(seconds: number): string {
  return `${(seconds / 3600).toFixed(2)}h`;
}

function getCompletionPct(
  trackedSeconds: number,
  estimateSeconds: number,
): number | null {
  if (estimateSeconds <= 0) {
    return null;
  }
  return (trackedSeconds / estimateSeconds) * 100;
}

function formatPercentage(trackedSeconds: number, estimateSeconds: number): string {
  const pct = getCompletionPct(trackedSeconds, estimateSeconds);
  if (pct === null) {
    return "—";
  }
  return `${Math.round(pct)}%`;
}

function getPercentageColorClass(
  trackedSeconds: number,
  estimateSeconds: number,
): string | undefined {
  const pct = getCompletionPct(trackedSeconds, estimateSeconds);
  if (pct === null) {
    return undefined;
  }
  if (pct <= 100) {
    return styles.pctGreen;
  }
  if (pct <= 150) {
    return styles.pctYellow;
  }
  return styles.pctRed;
}

function chunkRows(rows: ProjectHoursRow[], pageSize: number): ProjectHoursRow[][] {
  const pages: ProjectHoursRow[][] = [];
  for (let i = 0; i < rows.length; i += pageSize) {
    pages.push(rows.slice(i, i + pageSize));
  }
  return pages;
}

export default function ProjectsTable({
  rows,
  compact = false,
  fillContainer = false,
  autoplayEnabled = true,
  syncTick,
  onCycleComplete,
}: Props) {
  const { ref: fillRef, rowCount: fitRowCount } = useFitRowCount({
    chromeHeight: fillContainer ? TV_TABLE_CHROME_PX : 0,
    rowHeight: compact ? 30 : 40,
    fallback: compact ? 7 : DEFAULT_ROWS_PER_PAGE,
  });

  const rowsPerPage = fillContainer ? fitRowCount : DEFAULT_ROWS_PER_PAGE;
  const pages = useMemo(() => chunkRows(rows, rowsPerPage), [rows, rowsPerPage]);
  const n = pages.length;
  const [rowsPerPageSnapshot, setRowsPerPageSnapshot] = useState(rowsPerPage);

  useEffect(() => {
    setRowsPerPageSnapshot(rowsPerPage);
  }, [rowsPerPage]);

  const { index, goPrev, goNext, timerEpoch } = useSlideshow({
    count: n,
    slideMs: ROTATE_MS,
    autoplayEnabled,
    syncTick,
    onCycleComplete,
  });

  const currentRows = pages[index] ?? [];

  return (
    <section
      className={`${styles.section} ${styles.rotator} ${compact ? styles.compact : ""} ${fillContainer ? styles.fillContainer : ""}`}
    >
      <div className={styles.header}>
        <div className={styles.headerRow}>
          <h2>Project Performance</h2>
          <SlideshowNav
            index={index}
            count={n}
            slideMs={ROTATE_MS}
            onPrev={goPrev}
            onNext={goNext}
            progressKey={`${index}-${timerEpoch}-${rowsPerPageSnapshot}`}
            layout="inline"
            compact={compact}
            className={styles.headerNav}
          />
        </div>
        {!fillContainer ? (
          <p className={styles.sub}>
            Project name, assign hours, actual hours, and completion % from Timesheets.{" "}
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
                      <tr
                        key={row.projectId}
                        className={getPercentageColorClass(
                          row.trackedSeconds,
                          row.estimateSeconds,
                        )}
                      >
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

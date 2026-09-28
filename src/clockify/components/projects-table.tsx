"use client";

import {
  PROJECT_TRACKED_LOOKBACK_MONTHS,
  type ProjectHoursRange,
} from "@/clockify/lib/attendance";
import type { ProjectHoursRow } from "@/clockify/lib/project-hours";
import { UNDER_HOURS_ROTATE_MS } from "@/clockify/lib/kiosk-timing";
import SlideshowNav from "@/components/slideshow-nav";
import { useFitRowCount } from "@/lib/use-fit-row-count";
import { useSlideshow } from "@/lib/use-slideshow";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./projects-table.module.css";

const DEFAULT_ROWS_PER_PAGE = 10;
/** Compact thead + panel padding consumed when measuring body height. */
const TV_TABLE_CHROME_PX = 38;
const ROTATE_MS = UNDER_HOURS_ROTATE_MS;
const RANGE_LOAD_TIMEOUT_MS = 300_000;

type Props = {
  rows: ProjectHoursRow[];
  projectRange?: ProjectHoursRange | null;
  enableRangePicker?: boolean;
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

function todayDateKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function monthsAgoDateKey(months: number): string {
  const now = new Date();
  now.setMonth(now.getMonth() - months);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function ProjectsTable({
  rows: initialRows,
  projectRange = null,
  enableRangePicker = false,
  compact = false,
  fillContainer = false,
  autoplayEnabled = true,
  syncTick,
  onCycleComplete,
}: Props) {
  const defaultStart =
    projectRange?.startDateKey ?? monthsAgoDateKey(PROJECT_TRACKED_LOOKBACK_MONTHS);
  const defaultEnd = projectRange?.endDateKey ?? todayDateKey();

  const [rows, setRows] = useState(initialRows);
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [appliedRange, setAppliedRange] = useState({
    start: defaultStart,
    end: defaultEnd,
  });
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeError, setRangeError] = useState<string | null>(null);

  useEffect(() => {
    // With range picker, actual hours come from /api/project-hours — don't wipe them
    // when attendance refreshes with estimate-only rows.
    if (enableRangePicker) {
      return;
    }
    setRows(initialRows);
  }, [initialRows, enableRangePicker]);

  useEffect(() => {
    if (!projectRange) {
      return;
    }
    setStartDate(projectRange.startDateKey);
    setEndDate(projectRange.endDateKey);
    setAppliedRange({
      start: projectRange.startDateKey,
      end: projectRange.endDateKey,
    });
  }, [projectRange?.startDateKey, projectRange?.endDateKey]);

  const loadRange = useCallback(async (start: string, end: string) => {
    if (start > end) {
      setRangeError("Start date must be on or before end date.");
      return;
    }
    setRangeLoading(true);
    setRangeError(null);
    try {
      const response = await fetch(
        `/api/project-hours?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
        {
          cache: "no-store",
          signal: AbortSignal.timeout(RANGE_LOAD_TIMEOUT_MS),
        },
      );
      const body = (await response.json()) as {
        rows?: ProjectHoursRow[];
        error?: string;
        details?: string;
      };
      if (!response.ok) {
        throw new Error(body.details ?? body.error ?? `HTTP ${response.status}`);
      }
      setRows(body.rows ?? []);
      setAppliedRange({ start, end });
    } catch (error) {
      setRangeError(
        error instanceof Error ? error.message : "Failed to load project hours",
      );
    } finally {
      setRangeLoading(false);
    }
  }, []);

  // Initial / default range: load actual hours without blocking attendance snapshot.
  useEffect(() => {
    if (!enableRangePicker) {
      return;
    }
    void loadRange(defaultStart, defaultEnd);
  }, [enableRangePicker, defaultStart, defaultEnd, loadRange]);

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
    autoplayEnabled: autoplayEnabled && !rangeLoading,
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
        {enableRangePicker ? (
          <div className={styles.rangeBar}>
            <label className={styles.rangeField}>
              <span>From</span>
              <input
                type="date"
                value={startDate}
                max={endDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={rangeLoading}
              />
            </label>
            <label className={styles.rangeField}>
              <span>To</span>
              <input
                type="date"
                value={endDate}
                min={startDate}
                max={todayDateKey()}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={rangeLoading}
              />
            </label>
            <button
              type="button"
              className={styles.rangeButton}
              disabled={rangeLoading}
              onClick={() => void loadRange(startDate, endDate)}
            >
              {rangeLoading ? "Loading…" : "Apply"}
            </button>
          </div>
        ) : null}
        {!fillContainer ? (
          <p className={styles.sub}>
            Project name, assign hours, actual hours, and completion % from Timesheets
            ({appliedRange.start} → {appliedRange.end}).{" "}
            {n > 1
              ? `Showing ${rowsPerPage} projects per page. Auto-advances every ${ROTATE_MS / 1000} seconds.`
              : rows.length > 0
                ? `Showing up to ${rowsPerPage} projects.`
                : null}
          </p>
        ) : (
          <p className={styles.rangeHint}>
            Actual hours: {appliedRange.start} → {appliedRange.end}
            {rangeLoading ? " · Loading…" : null}
            {rangeError ? ` · ${rangeError}` : null}
          </p>
        )}
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
                  {rangeLoading
                    ? "Loading project hours for selected range…"
                    : rangeError
                      ? rangeError
                      : "No active projects found in this workspace."}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

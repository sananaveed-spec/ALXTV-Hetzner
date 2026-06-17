"use client";

import {
  TODAY_TODO_ROWS_PER_PAGE,
  TODAY_TODO_SLIDE_MS,
} from "@/lib/kiosk-timing";
import type { TodayTodoRow } from "@/lib/today-todo-parse";
import { useRouter } from "next/navigation";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Props = {
  rows: TodayTodoRow[];
  todayLabel: string;
  rowsPerPage?: number;
  slideMs?: number;
  showAllRows?: boolean;
};

function chunkRows<T>(rows: T[], size: number): T[][] {
  if (rows.length === 0) {
    return [];
  }
  const pages: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    pages.push(rows.slice(i, i + size));
  }
  return pages;
}

function TodoTable({ pageRows }: { pageRows: TodayTodoRow[] }) {
  return (
    <div className="engineerBoardTableWrap">
      <table className="engineerBoardTable projectDetailsTable">
        <thead>
          <tr>
            <th>Reminder</th>
            <th>Reminder Date</th>
            <th>Project Name</th>
          </tr>
        </thead>
        <tbody>
          {pageRows.map((row, ri) => (
            <tr key={ri}>
              <td>{row.reminder}</td>
              <td>{row.reminderDate}</td>
              <td>{row.projectName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function TodayTodoSlider({
  rows,
  todayLabel,
  rowsPerPage = TODAY_TODO_ROWS_PER_PAGE,
  slideMs,
  showAllRows = false,
}: Props) {
  const router = useRouter();
  const safeSlideMs = useMemo(() => {
    const n = Number(slideMs ?? TODAY_TODO_SLIDE_MS);
    return Number.isFinite(n) && n >= 2000 ? n : TODAY_TODO_SLIDE_MS;
  }, [slideMs]);

  const pages = useMemo(
    () =>
      showAllRows
        ? rows.length > 0
          ? [rows]
          : []
        : chunkRows(rows, rowsPerPage),
    [rows, rowsPerPage, showAllRows],
  );
  const count = pages.length;
  const [index, setIndex] = useState(0);
  const [timerEpoch, setTimerEpoch] = useState(0);
  const countRef = useRef(count);

  useEffect(() => {
    countRef.current = count;
  }, [count]);

  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, count - 1)));
  }, [count]);

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
      router.refresh();
    }
    prevIndexRef.current = index;
  }, [index, count, router]);

  const advanceSlide = useCallback(() => {
    setIndex((currentIndex) => {
      const pageCount = countRef.current;
      if (pageCount <= 1) {
        return 0;
      }
      return (currentIndex + 1) % pageCount;
    });
  }, []);

  useEffect(() => {
    if (count <= 1) {
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
  }, [count, safeSlideMs, advanceSlide, timerEpoch]);

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
    advanceSlide();
    setTimerEpoch((e) => e + 1);
  }, [count, advanceSlide]);

  if (rows.length === 0) {
    return (
      <div className="engineerBoardTableWrap">
        <table className="engineerBoardTable projectDetailsTable">
          <thead>
            <tr>
              <th>Reminder</th>
              <th>Reminder Date</th>
              <th>Project Name</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={3} className="engineerBoardTableEmpty">
                No reminders for {todayLabel}.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  const currentPage = pages[index]!;

  return (
    <div className="engineerSlider">
      {!showAllRows && count > 1 ? (
        <div className="engineerSliderMeta">
          <button
            type="button"
            className="engineerSliderNavBtn"
            onClick={goPrev}
            aria-label="Previous page"
          >
            {"<"}
          </button>
          <span className="engineerSliderCounter">
            {index + 1} / {count}
          </span>
          <div
            className="engineerSliderProgressTrack"
            aria-hidden
            key={index}
            style={
              {
                "--slide-ms": `${safeSlideMs}ms`,
              } as CSSProperties
            }
          >
            <div className="engineerSliderProgressFill" />
          </div>
          <button
            type="button"
            className="engineerSliderNavBtn"
            onClick={goNext}
            aria-label="Next page"
          >
            {">"}
          </button>
        </div>
      ) : null}

      <TodoTable pageRows={currentPage} />
    </div>
  );
}

"use client";

import {
  TODAY_TODO_ROWS_PER_PAGE,
  TODAY_TODO_SLIDE_MS,
} from "@/lib/kiosk-timing";
import type { TodayTodoRow } from "@/lib/today-todo-parse";
import SlideshowNav from "@/components/slideshow-nav";
import { useSlideshow } from "@/lib/use-slideshow";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

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

  const { index, goPrev, goNext, timerEpoch } = useSlideshow({
    count,
    slideMs: safeSlideMs,
    autoplayEnabled: !showAllRows,
    onCycleComplete: () => router.refresh(),
  });

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
      {!showAllRows ? (
        <SlideshowNav
          index={index}
          count={count}
          slideMs={safeSlideMs}
          onPrev={goPrev}
          onNext={goNext}
          progressKey={`${index}-${timerEpoch}`}
        />
      ) : null}

      <TodoTable pageRows={currentPage} />
    </div>
  );
}

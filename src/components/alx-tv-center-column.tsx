"use client";

import TodayTodoTable from "@/components/today-todo-table";
import type { AlxTvGoogleSheetData } from "@/lib/alx-tv-google-sheet";
import styles from "./alx-tv-dashboard.module.css";

type Props = {
  googleSheet: AlxTvGoogleSheetData;
};

export default function AlxTvCenterColumn({ googleSheet }: Props) {
  if (!googleSheet.ok) {
    return (
      <section className={`errorCard ${styles.todoSection}`}>
        <p>{googleSheet.message}</p>
        {googleSheet.details ? (
          <p className="hint">{googleSheet.details}</p>
        ) : null}
      </section>
    );
  }

  return (
    <div className={styles.todoSection}>
      <TodayTodoTable
        rows={googleSheet.todayTodoRows}
        todayLabel={googleSheet.todayTodoLabel}
        slideMs={googleSheet.todayTodoSlideMs}
        tvMode
      />
    </div>
  );
}

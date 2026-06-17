import DashboardSection from "@/components/dashboard-section";
import TodayTodoSlider from "@/components/today-todo-slider";
import { TODAY_TODO_SLIDE_MS } from "@/lib/kiosk-timing";
import type { TodayTodoRow } from "@/lib/today-todo-parse";

type Props = {
  rows: TodayTodoRow[];
  todayLabel: string;
  slideMs?: number;
  tvMode?: boolean;
};

export default function TodayTodoTable({
  rows,
  todayLabel,
  slideMs = TODAY_TODO_SLIDE_MS,
  tvMode = false,
}: Props) {
  return (
    <DashboardSection title="Today TO DO LIST">
      <TodayTodoSlider
        rows={rows}
        todayLabel={todayLabel}
        slideMs={slideMs}
        showAllRows={tvMode}
      />
    </DashboardSection>
  );
}

import {
  buildRangeForTab,
  getSheetTimezoneFromEnv,
} from "@/lib/google-sheets-auth";
import { fetchSpreadsheetRange } from "@/lib/spreadsheet-values";
import {
  filterTodayTodoRowsForToday,
  formatTodayLabel,
} from "@/lib/today-todo-date";
import {
  parseTodayTodoValues,
  type TodayTodoRow,
} from "@/lib/today-todo-parse";

export type TodayTodoPayload = {
  rows: TodayTodoRow[];
  todayLabel: string;
  timezone: string;
};

export async function fetchTodayTodoPayload(
  spreadsheetId: string,
  tabName: string,
): Promise<TodayTodoPayload> {
  const timezone = getSheetTimezoneFromEnv();
  const rangeA1 = buildRangeForTab(tabName, "A:Z");
  const grid = await fetchSpreadsheetRange(spreadsheetId, rangeA1);
  const allRows = parseTodayTodoValues(grid.values);
  const rows = filterTodayTodoRowsForToday(allRows, timezone);

  return {
    rows,
    todayLabel: formatTodayLabel(timezone),
    timezone,
  };
}

export type { TodayTodoRow };

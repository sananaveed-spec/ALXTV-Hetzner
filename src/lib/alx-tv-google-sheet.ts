import { mapGoogleSheetsError } from "@/lib/google-api-errors";
import { fetchEngineerLoadPayload } from "@/lib/engineer-load";
import { fetchTodayTodoPayload } from "@/lib/today-todo";
import {
  getEngineerLoadTabFromEnv,
  getSpreadsheetIdFromEnv,
  getTodayTodoSlideMsFromEnv,
  getTodayTodoTabFromEnv,
} from "@/lib/google-sheets-auth";
import { dataRefreshMsForLeadCount, MIN_DATA_REFRESH_MS } from "@/lib/kiosk-timing";
import { createStaleCache } from "@/lib/stale-data-cache";
import type { EngineerLoadBoard } from "@/lib/engineer-load-parse";
import type { TodayTodoRow } from "@/lib/today-todo-parse";

export type AlxTvGoogleSheetData =
  | {
      ok: true;
      engineerBoards: EngineerLoadBoard[];
      engineerSlideMs: number;
      todayTodoRows: TodayTodoRow[];
      todayTodoLabel: string;
      todayTodoSlideMs: number;
      dataRefreshMs: number;
    }
  | {
      ok: false;
      message: string;
      details?: string;
      dataRefreshMs: number;
    };

type AlxTvGoogleSheetSuccess = Extract<AlxTvGoogleSheetData, { ok: true }>;

const googleSheetCache = createStaleCache<AlxTvGoogleSheetSuccess>();

function buildSuccessPayload(
  engineerBoards: EngineerLoadBoard[],
  todayTodoRows: TodayTodoRow[],
  todayTodoLabel: string,
  slideMs: number,
  todayTodoSlideMs: number,
): AlxTvGoogleSheetSuccess {
  const dataRefreshMs = dataRefreshMsForLeadCount(engineerBoards.length, slideMs);
  return {
    ok: true,
    engineerBoards,
    engineerSlideMs: slideMs,
    todayTodoRows,
    todayTodoLabel,
    todayTodoSlideMs,
    dataRefreshMs,
  };
}

export async function loadAlxTvGoogleSheetData(): Promise<AlxTvGoogleSheetData> {
  const spreadsheetId = getSpreadsheetIdFromEnv();
  const engineerTabName = getEngineerLoadTabFromEnv();
  const todayTodoTabName = getTodayTodoTabFromEnv();
  const slideMs = 15_000;
  const todayTodoSlideMs = getTodayTodoSlideMsFromEnv();
  const previous = googleSheetCache.get();

  if (!spreadsheetId) {
    if (previous) {
      return previous;
    }
    return {
      ok: false,
      message: "Set GOOGLE_SPREADSHEET_ID in .env.local.",
      dataRefreshMs: MIN_DATA_REFRESH_MS,
    };
  }

  let engineerBoards: EngineerLoadBoard[] | null = null;
  let engineerError: ReturnType<typeof mapGoogleSheetsError> | null = null;

  try {
    const engineerPayload = await fetchEngineerLoadPayload(
      spreadsheetId,
      engineerTabName,
    );
    engineerBoards = engineerPayload.boards;
  } catch (error) {
    engineerError = mapGoogleSheetsError(error);
    if (previous) {
      engineerBoards = previous.engineerBoards;
    }
  }

  let todayTodoRows: TodayTodoRow[] | null = null;
  let todayTodoLabel = "";
  let todayTodoError: ReturnType<typeof mapGoogleSheetsError> | null = null;

  try {
    const todayTodoPayload = await fetchTodayTodoPayload(
      spreadsheetId,
      todayTodoTabName,
    );
    todayTodoRows = todayTodoPayload.rows;
    todayTodoLabel = todayTodoPayload.todayLabel;
  } catch (error) {
    todayTodoError = mapGoogleSheetsError(error);
    if (previous) {
      todayTodoRows = previous.todayTodoRows;
      todayTodoLabel = previous.todayTodoLabel;
    }
  }

  if (engineerBoards && todayTodoRows) {
    const result = buildSuccessPayload(
      engineerBoards,
      todayTodoRows,
      todayTodoLabel,
      slideMs,
      todayTodoSlideMs,
    );
    googleSheetCache.set(result);
    return result;
  }

  if (previous) {
    return previous;
  }

  if (engineerError) {
    return {
      ok: false,
      message: `Could not read tab "${engineerTabName}". ${engineerError.message}`,
      details: engineerError.details,
      dataRefreshMs: MIN_DATA_REFRESH_MS,
    };
  }

  if (todayTodoError) {
    return {
      ok: false,
      message: `Could not read tab "${todayTodoTabName}". ${todayTodoError.message}`,
      details: todayTodoError.details,
      dataRefreshMs: MIN_DATA_REFRESH_MS,
    };
  }

  return {
    ok: false,
    message: "Could not load Google Sheet data.",
    dataRefreshMs: MIN_DATA_REFRESH_MS,
  };
}

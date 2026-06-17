import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];

export function getSpreadsheetIdFromEnv(): string | undefined {
  const id = process.env.GOOGLE_SPREADSHEET_ID;
  return id?.trim() || undefined;
}

export function getSheetRangeFromEnv(): string | undefined {
  const range = process.env.GOOGLE_SHEET_RANGE;
  return range?.trim() || undefined;
}

/** Tab name for the engineer load kiosk (default ENGINEER LOAD). */
export function getEngineerLoadTabFromEnv(): string {
  const tab = process.env.GOOGLE_ENGINEER_LOAD_TAB?.trim();
  return tab || "ENGINEER LOAD";
}

/** Tab name for project details (default PROJECTS). */
export function getProjectsTabFromEnv(): string {
  const tab = process.env.GOOGLE_PROJECTS_TAB?.trim();
  return tab || "PROJECTS";
}

/** Tab name for today's todo list (default Today TO DO LIST). */
export function getTodayTodoTabFromEnv(): string {
  const tab = process.env.GOOGLE_TODAY_TODO_TAB?.trim();
  return tab || "Today TO DO LIST";
}

/** IANA timezone for matching Reminder Date to “today” (default Asia/Karachi). */
export function getSheetTimezoneFromEnv(): string {
  const tz = process.env.GOOGLE_SHEET_TIMEZONE?.trim();
  return tz || "Asia/Karachi";
}

/** Milliseconds per Today TO DO LIST page (default 10000, min 2000, max 120000). */
export function getTodayTodoSlideMsFromEnv(): number {
  const raw = process.env.GOOGLE_TODAY_TODO_SLIDE_MS?.trim();
  if (!raw) {
    return 10_000;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) {
    return 10_000;
  }
  return Math.min(120_000, Math.max(2000, n));
}

/** Milliseconds per lead on the home carousel (default 30000, min 2000, max 120000). */
export function getEngineerLoadSlideMsFromEnv(): number {
  const raw =
    process.env.GOOGLE_ENGINEER_SLIDE_MS?.trim() ??
    process.env.GOOGLE_ENGINEER_ROTATE_MS?.trim();
  if (!raw) {
    return 30_000;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) {
    return 30_000;
  }
  return Math.min(120_000, Math.max(2000, n));
}

/** A1 range for a tab; escapes single quotes in tab names per Sheets API rules. */
export function buildRangeForTab(tabName: string, cellRange = "A:Z"): string {
  const escaped = tabName.replace(/'/g, "''");
  return `'${escaped}'!${cellRange}`;
}

/**
 * Builds an authenticated Google Sheets API client.
 * Prefer `GOOGLE_SERVICE_ACCOUNT_JSON` (full JSON as one line) for hosting;
 * use `GOOGLE_APPLICATION_CREDENTIALS` (path to JSON file) for local dev.
 */
export function createSheetsClient() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (json) {
    let credentials: Record<string, unknown>;
    try {
      credentials = JSON.parse(json) as Record<string, unknown>;
    } catch {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.");
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: SCOPES,
    });

    return google.sheets({ version: "v4", auth });
  }

  if (keyFile) {
    const auth = new google.auth.GoogleAuth({
      keyFile,
      scopes: SCOPES,
    });

    return google.sheets({ version: "v4", auth });
  }

  throw new Error(
    "Set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS for Google Sheets access.",
  );
}

import type { TodayTodoRow } from "@/lib/today-todo-parse";

/** YYYY-MM-DD in the given IANA timezone. */
export function todayDateKeyInTimezone(
  timezone: string,
  refDate: Date = new Date(),
): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(refDate);
}

/** Human-readable label for the kiosk subtitle (workspace timezone). */
export function formatTodayLabel(timezone: string, refDate: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(refDate);
}

/**
 * Parses a Reminder Date cell into YYYY-MM-DD in the workspace timezone.
 * Supports Google Sheets serial numbers and common string formats.
 */
export function parseReminderDateToDateKey(
  raw: string,
  timezone: string,
): string | null {
  const t = raw.trim();
  if (!t) {
    return null;
  }

  const serial = Number(t);
  if (Number.isFinite(serial) && serial > 0 && serial < 1_000_000) {
    const utcMs = Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000;
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(
      new Date(utcMs),
    );
  }

  const parsed = Date.parse(t);
  if (!Number.isNaN(parsed)) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(
      new Date(parsed),
    );
  }

  const dmy = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (dmy) {
    const day = Number.parseInt(dmy[1]!, 10);
    const month = Number.parseInt(dmy[2]!, 10);
    let year = Number.parseInt(dmy[3]!, 10);
    if (year < 100) {
      year += 2000;
    }
    const local = new Date(year, month - 1, day);
    if (!Number.isNaN(local.getTime())) {
      return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(local);
    }
  }

  return null;
}

export function isReminderDateToday(
  raw: string,
  timezone: string,
  todayKey?: string,
): boolean {
  const key = parseReminderDateToDateKey(raw, timezone);
  if (!key) {
    return false;
  }
  const today = todayKey ?? todayDateKeyInTimezone(timezone);
  return key === today;
}

export function filterTodayTodoRowsForToday(
  rows: TodayTodoRow[],
  timezone: string,
): TodayTodoRow[] {
  const todayKey = todayDateKeyInTimezone(timezone);
  return rows.filter((row) =>
    isReminderDateToday(row.reminderDate, timezone, todayKey),
  );
}

import type { WeeklyHoursReport } from "@/clockify/lib/attendance";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export type UnderTargetGap = {
  userId: string;
  name: string;
  dateKey: string;
  dateLabel: string;
  seconds: number;
  targetSeconds: number;
};

export type EmployeeWeekdaySlot = {
  dateKey: string;
  dateLabel: string;
  seconds: number;
  targetSeconds: number;
  underTarget: boolean;
};

export type EmployeeWeekdaySlide = {
  userId: string;
  name: string;
  slots: EmployeeWeekdaySlot[];
};

const DEFAULT_TARGET_HOURS = 8;

function isWeekdayInWorkspace(dateKey: string, timezone: string): boolean {
  const instant = fromZonedTime(`${dateKey}T12:00:00.000`, timezone);
  const isoDow = Number(formatInTimeZone(instant, timezone, "i"));
  return isoDow >= 1 && isoDow <= 5;
}

/** Weekday rows in `weekly` where logged time is strictly under the target (default 8h). */
export function findUnderTargetWeekdayGaps(
  weekly: WeeklyHoursReport,
  timezone: string,
  targetHours: number = DEFAULT_TARGET_HOURS,
): UnderTargetGap[] {
  const targetSeconds = targetHours * 3600;
  const gaps: UnderTargetGap[] = [];

  for (const row of weekly.rows) {
    weekly.dayColumns.forEach((col, i) => {
      if (!isWeekdayInWorkspace(col.dateKey, timezone)) {
        return;
      }
      const seconds = row.secondsPerDay[i] ?? 0;
      if (seconds >= targetSeconds) {
        return;
      }
      gaps.push({
        userId: row.userId,
        name: row.name,
        dateKey: col.dateKey,
        dateLabel: col.label,
        seconds,
        targetSeconds,
      });
    });
  }

  gaps.sort((a, b) => {
    const byDate = a.dateKey.localeCompare(b.dateKey);
    if (byDate !== 0) {
      return byDate;
    }
    return a.name.localeCompare(b.name);
  });

  return gaps;
}

/** One slide per employee: weekday dates in the rolling window with hours vs 8h target. */
export function buildEmployeeWeekdaySlides(
  weekly: WeeklyHoursReport,
  timezone: string,
  targetHours: number = DEFAULT_TARGET_HOURS,
): EmployeeWeekdaySlide[] {
  const targetSeconds = targetHours * 3600;
  const slides: EmployeeWeekdaySlide[] = weekly.rows.map((row) => {
    const slots: EmployeeWeekdaySlot[] = [];
    weekly.dayColumns.forEach((col, i) => {
      if (!isWeekdayInWorkspace(col.dateKey, timezone)) {
        return;
      }
      const seconds = row.secondsPerDay[i] ?? 0;
      slots.push({
        dateKey: col.dateKey,
        dateLabel: col.label,
        seconds,
        targetSeconds,
        underTarget: seconds < targetSeconds,
      });
    });
    slots.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
    return { userId: row.userId, name: row.name, slots };
  });
  return slides;
}

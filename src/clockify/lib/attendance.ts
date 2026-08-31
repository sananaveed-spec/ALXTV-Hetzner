import {
  ClockifyClient,
  getTimeEntrySeconds,
  LIFETIME_START,
  type ClockifyUser,
} from "@/clockify/lib/clockify";
import type { ClockifyTimeEntry } from "@/clockify/lib/clockify";
import {
  compareDashboardNames,
  getDashboardAllowlist,
  isIncludedOnDashboard,
  normalizePersonName,
} from "@/clockify/lib/employee-exclusions";
import { mapProjectsToHoursRows, type ProjectHoursRow } from "@/clockify/lib/project-hours";
import { addDays, addMonths, subDays, subMonths } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export type UserAttendance = {
  userId: string;
  name: string;
  email: string;
  trackedSeconds: number;
  present: boolean;
};

export type AttendanceSnapshot = {
  generatedAt: string;
  startISO: string;
  endISO: string;
  /** Calendar today in workspace timezone, e.g. "Wed 5/21". */
  todayLabel: string;
  totalUsers: number;
  presentCount: number;
  absentCount: number;
  totalTrackedSeconds: number;
  users: UserAttendance[];
};

export type WeeklyDayColumn = {
  dateKey: string;
  label: string;
};

export type WeeklyEmployeeRow = {
  userId: string;
  name: string;
  /** Seconds per day, same order as `weekly.dayColumns` */
  secondsPerDay: number[];
  weekTotalSeconds: number;
};

export type WeeklyHoursReport = {
  rangeLabel: string;
  dayColumns: WeeklyDayColumn[];
  rows: WeeklyEmployeeRow[];
  dayTotalsSeconds: number[];
};

export type DailyBillableHours = {
  dateKey: string;
  label: string;
  billableSeconds: number;
};

export type WeekBillableHours = {
  rangeLabel: string;
  billableSeconds: number;
  nonBillableSeconds: number;
  /** Per-day billable totals grouped by calendar day. */
  dailyBillable?: DailyBillableHours[];
};

export type DashboardSnapshot = AttendanceSnapshot & {
  timezone: string;
  weekly: WeeklyHoursReport;
  projects: ProjectHoursRow[];
  thisWeek: WeekBillableHours;
  lastWeek: WeekBillableHours;
  thisMonth: WeekBillableHours;
  lastMonth: WeekBillableHours;
};

const REQUEST_CONCURRENCY = 3;

function toHours(seconds: number): number {
  return Math.round((seconds / 3600) * 100) / 100;
}

export function getTodayRangeInWorkspaceTimezone(timezone: string): {
  startISO: string;
  endISO: string;
} {
  const now = new Date();
  const todayDate = formatInTimeZone(now, timezone, "yyyy-MM-dd");

  const startISO = fromZonedTime(`${todayDate}T00:00:00.000`, timezone).toISOString();
  const endISO = fromZonedTime(`${todayDate}T23:59:59.999`, timezone).toISOString();

  return { startISO, endISO };
}

/** Oldest → newest calendar days in `timezone`, ending today (7 days). */
export function getRollingSevenDayWindow(timezone: string): {
  dayKeys: string[];
  weekStartISO: string;
  weekEndISO: string;
  dayColumns: WeeklyDayColumn[];
} {
  const now = new Date();
  const todayStr = formatInTimeZone(now, timezone, "yyyy-MM-dd");
  const anchor = fromZonedTime(`${todayStr}T12:00:00.000`, timezone);

  const dayKeys: string[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = subDays(anchor, i);
    dayKeys.push(formatInTimeZone(d, timezone, "yyyy-MM-dd"));
  }

  const first = dayKeys[0]!;
  const last = dayKeys[6]!;
  const weekStartISO = fromZonedTime(`${first}T00:00:00.000`, timezone).toISOString();
  const weekEndISO = fromZonedTime(`${last}T23:59:59.999`, timezone).toISOString();

  const dayColumns: WeeklyDayColumn[] = dayKeys.map((dateKey) => ({
    dateKey,
    label: formatInTimeZone(
      fromZonedTime(`${dateKey}T12:00:00.000`, timezone),
      timezone,
      "EEE M/d",
    ),
  }));

  return { dayKeys, weekStartISO, weekEndISO, dayColumns };
}

/** Monday → Sunday calendar week in workspace timezone (`weeksAgo`: 0 = this week, 1 = last week). */
export function getCalendarWeekRange(
  timezone: string,
  weeksAgo: 0 | 1,
): {
  weekStartISO: string;
  weekEndISO: string;
  rangeLabel: string;
  mondayDateKey: string;
  sundayDateKey: string;
  /** Date range keys in workspace timezone. */
  reportDateStart: string;
  reportDateEnd: string;
} {
  const now = new Date();
  const todayStr = formatInTimeZone(now, timezone, "yyyy-MM-dd");
  const anchor = fromZonedTime(`${todayStr}T12:00:00.000`, timezone);
  const isoWeekday = Number(formatInTimeZone(anchor, timezone, "i"));
  const thisWeekMonday = subDays(anchor, isoWeekday - 1);
  const weekMonday =
    weeksAgo === 0 ? thisWeekMonday : subDays(thisWeekMonday, 7);
  const weekSunday = addDays(weekMonday, 6);

  const mondayKey = formatInTimeZone(weekMonday, timezone, "yyyy-MM-dd");
  const sundayKey = formatInTimeZone(weekSunday, timezone, "yyyy-MM-dd");
  const weekStartISO = fromZonedTime(
    `${mondayKey}T00:00:00.000`,
    timezone,
  ).toISOString();
  const weekEndISO = fromZonedTime(
    `${sundayKey}T23:59:59.999`,
    timezone,
  ).toISOString();
  const rangeLabel = `${formatInTimeZone(weekMonday, timezone, "EEE M/d")} → ${formatInTimeZone(weekSunday, timezone, "EEE M/d")}`;

  return {
    weekStartISO,
    weekEndISO,
    rangeLabel,
    mondayDateKey: mondayKey,
    sundayDateKey: sundayKey,
    reportDateStart: `${mondayKey}T00:00:00.000`,
    reportDateEnd: `${sundayKey}T23:59:59.999`,
  };
}

/** Calendar month in workspace timezone (`monthsAgo`: 0 = this month to date, 1 = full last month). */
export function getCalendarMonthRange(
  timezone: string,
  monthsAgo: 0 | 1,
): {
  periodStartISO: string;
  periodEndISO: string;
  rangeLabel: string;
  startDateKey: string;
  endDateKey: string;
  reportDateStart: string;
  reportDateEnd: string;
} {
  const now = new Date();
  const todayStr = formatInTimeZone(now, timezone, "yyyy-MM-dd");
  const anchor = fromZonedTime(`${todayStr}T12:00:00.000`, timezone);
  const monthAnchor = subMonths(anchor, monthsAgo);
  const startDateKey = formatInTimeZone(monthAnchor, timezone, "yyyy-MM-01");

  let endDateKey: string;
  if (monthsAgo === 0) {
    endDateKey = todayStr;
  } else {
    const monthStart = fromZonedTime(`${startDateKey}T12:00:00.000`, timezone);
    endDateKey = formatInTimeZone(
      subDays(addMonths(monthStart, 1), 1),
      timezone,
      "yyyy-MM-dd",
    );
  }

  const startNoon = fromZonedTime(`${startDateKey}T12:00:00.000`, timezone);
  const endNoon = fromZonedTime(`${endDateKey}T12:00:00.000`, timezone);
  const rangeLabel =
    monthsAgo === 0
      ? `${formatInTimeZone(startNoon, timezone, "MMM d")} → ${formatInTimeZone(endNoon, timezone, "MMM d")}`
      : formatInTimeZone(startNoon, timezone, "MMMM yyyy");

  return {
    periodStartISO: fromZonedTime(
      `${startDateKey}T00:00:00.000`,
      timezone,
    ).toISOString(),
    periodEndISO: fromZonedTime(
      `${endDateKey}T23:59:59.999`,
      timezone,
    ).toISOString(),
    rangeLabel,
    startDateKey,
    endDateKey,
    reportDateStart: `${startDateKey}T00:00:00.000`,
    reportDateEnd: `${endDateKey}T23:59:59.999`,
  };
}

function bucketSecondsByWorkspaceDay(
  entries: ClockifyTimeEntry[],
  timezone: string,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const entry of entries) {
    const sec = getTimeEntrySeconds(entry);
    if (sec <= 0) {
      continue;
    }
    const day = formatInTimeZone(
      new Date(entry.timeInterval.start),
      timezone,
      "yyyy-MM-dd",
    );
    map.set(day, (map.get(day) ?? 0) + sec);
  }
  return map;
}

function sumBillableSecondsInDateKeyRange(
  entries: ClockifyTimeEntry[],
  timezone: string,
  startDateKey: string,
  endDateKey: string,
): { billableSeconds: number; nonBillableSeconds: number } {
  let billableSeconds = 0;
  let nonBillableSeconds = 0;

  for (const entry of entries) {
    const sec = getTimeEntrySeconds(entry);
    if (sec <= 0) {
      continue;
    }
    const dayKey = formatInTimeZone(
      new Date(entry.timeInterval.start),
      timezone,
      "yyyy-MM-dd",
    );
    if (dayKey < startDateKey || dayKey > endDateKey) {
      continue;
    }
    if (entry.billable === false) {
      nonBillableSeconds += sec;
    } else {
      billableSeconds += sec;
    }
  }

  return { billableSeconds, nonBillableSeconds };
}

function earliestISO(a: string, b: string): string {
  return a < b ? a : b;
}

function latestISO(a: string, b: string): string {
  return a > b ? a : b;
}

/** Sum every workspace user's time entries (all statuses; no name exclusions). */
async function fetchWeekBillableFromAllUserEntries(
  client: ClockifyClient,
  users: ClockifyUser[],
  weekStartISO: string,
  weekEndISO: string,
  timezone: string,
  mondayDateKey: string,
  sundayDateKey: string,
): Promise<{ billableSeconds: number; nonBillableSeconds: number }> {
  let billableSeconds = 0;
  let nonBillableSeconds = 0;

  for (let i = 0; i < users.length; i += REQUEST_CONCURRENCY) {
    const batch = users.slice(i, i + REQUEST_CONCURRENCY);
    const batchTotals = await Promise.all(
      batch.map(async (user) => {
        try {
          const entries = await client.getUserTimeEntriesForRange(
            user.id,
            weekStartISO,
            weekEndISO,
          );
          return sumBillableSecondsInDateKeyRange(
            entries,
            timezone,
            mondayDateKey,
            sundayDateKey,
          );
        } catch {
          return { billableSeconds: 0, nonBillableSeconds: 0 };
        }
      }),
    );

    for (const totals of batchTotals) {
      billableSeconds += totals.billableSeconds;
      nonBillableSeconds += totals.nonBillableSeconds;
    }
  }

  return { billableSeconds, nonBillableSeconds };
}

function parseSummaryDateKey(name: string, timezone: string): string | null {
  const iso = name.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) {
    return iso[1]!;
  }
  const parsed = new Date(name);
  if (!Number.isNaN(parsed.getTime())) {
    return formatInTimeZone(parsed, timezone, "yyyy-MM-dd");
  }
  return null;
}

function buildDailyBillableFromSummary(
  rows: { name: string; seconds: number }[],
  timezone: string,
  mondayDateKey: string,
  sundayDateKey: string,
): DailyBillableHours[] {
  const byKey = new Map<string, number>();
  for (const row of rows) {
    const dateKey = parseSummaryDateKey(row.name, timezone);
    if (!dateKey || dateKey < mondayDateKey || dateKey > sundayDateKey) {
      continue;
    }
    byKey.set(dateKey, (byKey.get(dateKey) ?? 0) + row.seconds);
  }

  const mondayNoon = fromZonedTime(`${mondayDateKey}T12:00:00.000`, timezone);
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(mondayNoon, i);
    const dateKey = formatInTimeZone(d, timezone, "yyyy-MM-dd");
    return {
      dateKey,
      label: formatInTimeZone(d, timezone, "EEE M/d"),
      billableSeconds: byKey.get(dateKey) ?? 0,
    };
  });
}

/** Billable totals from per-user entries or org-wide time entries. */
async function loadWeekBillableTotals(
  client: ClockifyClient,
  allUsers: ClockifyUser[],
  timezone: string,
  weeksAgo: 0 | 1,
  range: {
    weekStartISO: string;
    weekEndISO: string;
    mondayDateKey: string;
    sundayDateKey: string;
    reportDateStart: string;
    reportDateEnd: string;
  },
): Promise<{
  billableSeconds: number;
  nonBillableSeconds: number;
  dailyBillable?: DailyBillableHours[];
}> {
  if (getDashboardAllowlist().length > 0) {
    return fetchWeekBillableFromAllUserEntries(
      client,
      allUsers,
      range.weekStartISO,
      range.weekEndISO,
      timezone,
      range.mondayDateKey,
      range.sundayDateKey,
    );
  }

  const dateRangeType = weeksAgo === 0 ? "THIS_WEEK" : "LAST_WEEK";

  try {
    const totals = await client.getWeekBillableTotals(
      range.reportDateStart,
      range.reportDateEnd,
      timezone,
      weeksAgo,
    );
    let dailyBillable: DailyBillableHours[] | undefined;
    try {
      const dayRows = await client.getSummaryBillableSecondsByDay(
        range.reportDateStart,
        range.reportDateEnd,
        timezone,
        "BILLABLE",
        dateRangeType,
      );
      dailyBillable = buildDailyBillableFromSummary(
        dayRows,
        timezone,
        range.mondayDateKey,
        range.sundayDateKey,
      );
    } catch {
      dailyBillable = undefined;
    }
    return { ...totals, dailyBillable };
  } catch {
    const fallback = await fetchWeekBillableFromAllUserEntries(
      client,
      allUsers,
      range.weekStartISO,
      range.weekEndISO,
      timezone,
      range.mondayDateKey,
      range.sundayDateKey,
    );
    return fallback;
  }
}

async function loadPeriodBillableTotals(
  client: ClockifyClient,
  allUsers: ClockifyUser[],
  timezone: string,
  range: {
    periodStartISO: string;
    periodEndISO: string;
    startDateKey: string;
    endDateKey: string;
    reportDateStart: string;
    reportDateEnd: string;
  },
): Promise<{ billableSeconds: number; nonBillableSeconds: number }> {
  if (getDashboardAllowlist().length > 0) {
    return fetchWeekBillableFromAllUserEntries(
      client,
      allUsers,
      range.periodStartISO,
      range.periodEndISO,
      timezone,
      range.startDateKey,
      range.endDateKey,
    );
  }

  try {
    return await client.getDetailedReportBillableTotals(
      range.reportDateStart,
      range.reportDateEnd,
      timezone,
    );
  } catch {
    return fetchWeekBillableFromAllUserEntries(
      client,
      allUsers,
      range.periodStartISO,
      range.periodEndISO,
      timezone,
      range.startDateKey,
      range.endDateKey,
    );
  }
}

export async function buildDashboardSnapshot(config: {
  apiKey: string;
  workspaceId: string;
  timezone: string;
}): Promise<DashboardSnapshot> {
  const client = new ClockifyClient({
    apiKey: config.apiKey,
    workspaceId: config.workspaceId,
    timezone: config.timezone,
  });
  const reportTimezone = await client.resolveReportTimezone(config.timezone);
  const { startISO, endISO } = getTodayRangeInWorkspaceTimezone(config.timezone);
  const { dayKeys, weekStartISO, weekEndISO, dayColumns } =
    getRollingSevenDayWindow(config.timezone);
  const todayKey = dayKeys[6]!;
  const thisWeekRange = getCalendarWeekRange(reportTimezone, 0);
  const lastWeekRange = getCalendarWeekRange(reportTimezone, 1);
  const thisMonthRange = getCalendarMonthRange(reportTimezone, 0);
  const lastMonthRange = getCalendarMonthRange(reportTimezone, 1);
  const fetchStartISO = earliestISO(
    earliestISO(weekStartISO, lastWeekRange.weekStartISO),
    lastMonthRange.periodStartISO,
  );
  const fetchEndISO = latestISO(weekEndISO, thisWeekRange.weekEndISO);

  const allUsers = await client.getAllUsers();
  const users = allUsers.filter(
    (user) => user.status === "ACTIVE" && isIncludedOnDashboard(user.name),
  );

  const [thisWeekTotals, lastWeekTotals, thisMonthTotals, lastMonthTotals] =
    await Promise.all([
    loadWeekBillableTotals(
      client,
      users,
      reportTimezone,
      0,
      thisWeekRange,
    ),
    loadWeekBillableTotals(
      client,
      users,
      reportTimezone,
      1,
      lastWeekRange,
    ),
    loadPeriodBillableTotals(client, users, reportTimezone, thisMonthRange),
    loadPeriodBillableTotals(client, users, reportTimezone, lastMonthRange),
  ]);
  const rawProjects = await client.getProjects().catch(() => []);
  const trackedByProject = await client
    .getProjectTrackedSecondsMap(LIFETIME_START, new Date().toISOString())
    .catch(() => new Map<string, number>());
  const enrichedProjects = rawProjects.map((project) => ({
    ...project,
    duration: trackedByProject.get(project.id) ?? 0,
  }));
  const projects = mapProjectsToHoursRows(enrichedProjects);

  const attendance: UserAttendance[] = [];
  const weeklyRows: WeeklyEmployeeRow[] = [];

  for (let i = 0; i < users.length; i += REQUEST_CONCURRENCY) {
    const batch = users.slice(i, i + REQUEST_CONCURRENCY);
    const batchResult = await Promise.all(
      batch.map(async (user) => {
        try {
          const entries = await client.getUserTimeEntriesForRange(
            user.id,
            fetchStartISO,
            fetchEndISO,
          );
          const byDay = bucketSecondsByWorkspaceDay(entries, config.timezone);
          const secondsPerDay = dayKeys.map((k) => byDay.get(k) ?? 0);
          const trackedSeconds = byDay.get(todayKey) ?? 0;
          const weekTotalSeconds = secondsPerDay.reduce((s, v) => s + v, 0);

          return {
            userId: user.id,
            name: user.name,
            email: user.email,
            trackedSeconds,
            present: trackedSeconds > 0,
            weekly: {
              userId: user.id,
              name: user.name,
              secondsPerDay,
              weekTotalSeconds,
            } satisfies WeeklyEmployeeRow,
          };
        } catch {
          return {
            userId: user.id,
            name: user.name,
            email: user.email,
            trackedSeconds: 0,
            present: false,
            weekly: {
              userId: user.id,
              name: user.name,
              secondsPerDay: dayKeys.map(() => 0),
              weekTotalSeconds: 0,
            } satisfies WeeklyEmployeeRow,
          };
        }
      }),
    );

    for (const row of batchResult) {
      attendance.push({
        userId: row.userId,
        name: row.name,
        email: row.email,
        trackedSeconds: row.trackedSeconds,
        present: row.present,
      });
      weeklyRows.push(row.weekly);
    }
  }

  const allowlist = getDashboardAllowlist();
  const matchedNormalized = new Set(
    [...attendance, ...weeklyRows].map((row) => normalizePersonName(row.name)),
  );

  for (const name of allowlist) {
    if (matchedNormalized.has(normalizePersonName(name))) {
      continue;
    }
    const userId = `allowlist:${normalizePersonName(name)}`;
    attendance.push({
      userId,
      name,
      email: "",
      trackedSeconds: 0,
      present: false,
    });
    weeklyRows.push({
      userId,
      name,
      secondsPerDay: dayKeys.map(() => 0),
      weekTotalSeconds: 0,
    });
    matchedNormalized.add(normalizePersonName(name));
  }

  attendance.sort((a, b) => compareDashboardNames(a.name, b.name));
  weeklyRows.sort((a, b) => compareDashboardNames(a.name, b.name));

  const filteredAttendance = attendance.filter((user) =>
    isIncludedOnDashboard(user.name),
  );
  const filteredWeeklyRows = weeklyRows.filter((row) =>
    isIncludedOnDashboard(row.name),
  );

  const presentCount = filteredAttendance.filter((user) => user.present).length;
  const totalTrackedSeconds = filteredAttendance.reduce(
    (sum, user) => sum + user.trackedSeconds,
    0,
  );

  const dayTotalsSeconds = dayKeys.map((_, col) =>
    filteredWeeklyRows.reduce(
      (sum, row) => sum + (row.secondsPerDay[col] ?? 0),
      0,
    ),
  );

  const rangeLabel = `${dayColumns[0]!.label} → ${dayColumns[6]!.label}`;

  return {
    generatedAt: new Date().toISOString(),
    timezone: reportTimezone,
    startISO,
    endISO,
    todayLabel: dayColumns[6]!.label,
    totalUsers: filteredAttendance.length,
    presentCount,
    absentCount: filteredAttendance.length - presentCount,
    totalTrackedSeconds,
    users: filteredAttendance,
    weekly: {
      rangeLabel,
      dayColumns,
      rows: filteredWeeklyRows,
      dayTotalsSeconds,
    },
    projects,
    thisWeek: {
      rangeLabel: thisWeekRange.rangeLabel,
      billableSeconds: thisWeekTotals.billableSeconds,
      nonBillableSeconds: thisWeekTotals.nonBillableSeconds,
      dailyBillable: thisWeekTotals.dailyBillable,
    },
    lastWeek: {
      rangeLabel: lastWeekRange.rangeLabel,
      billableSeconds: lastWeekTotals.billableSeconds,
      nonBillableSeconds: lastWeekTotals.nonBillableSeconds,
      dailyBillable: lastWeekTotals.dailyBillable,
    },
    thisMonth: {
      rangeLabel: thisMonthRange.rangeLabel,
      billableSeconds: thisMonthTotals.billableSeconds,
      nonBillableSeconds: thisMonthTotals.nonBillableSeconds,
    },
    lastMonth: {
      rangeLabel: lastMonthRange.rangeLabel,
      billableSeconds: lastMonthTotals.billableSeconds,
      nonBillableSeconds: lastMonthTotals.nonBillableSeconds,
    },
  };
}

/** Billable / non-billable share of combined time (always sums to 100%). */
export function getTimeSharePercents(
  billableSeconds: number,
  nonBillableSeconds: number,
): { billable: string; nonBillable: string } {
  const total = billableSeconds + nonBillableSeconds;
  if (total <= 0) {
    return { billable: "0%", nonBillable: "0%" };
  }
  const billablePct = Math.round((billableSeconds / total) * 100);
  return {
    billable: `${billablePct}%`,
    nonBillable: `${100 - billablePct}%`,
  };
}

/** Clockify UI style: 36:35, 48:00, 106:35 (hours:minutes, not decimal hours). */
export function formatDurationClockify(seconds: number): string {
  if (seconds <= 0) {
    return "0:00";
  }
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

export function formatHours(seconds: number): string {
  return `${toHours(seconds).toFixed(2)}h`;
}

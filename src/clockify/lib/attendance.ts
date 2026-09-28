import {
  ClockifyClient,
  getTimeEntrySeconds,
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

export type ProjectHoursRange = {
  startDateKey: string;
  endDateKey: string;
};

export type DashboardSnapshot = AttendanceSnapshot & {
  timezone: string;
  weekly: WeeklyHoursReport;
  projects: ProjectHoursRow[];
  /** Default project actual-hours window (last 12 months unless overridden). */
  projectRange?: ProjectHoursRange;
  thisWeek: WeekBillableHours;
  lastWeek: WeekBillableHours;
  thisMonth: WeekBillableHours;
  lastMonth: WeekBillableHours;
};

const REQUEST_CONCURRENCY = 6;
/** Default project tracked-hours lookback — lifetime org scans time out behind Cloudflare (524). */
export const PROJECT_TRACKED_LOOKBACK_MONTHS = 24;
/** Earliest date offered by the “All time” project-hours preset. */
export const PROJECT_HOURS_ALL_TIME_START = "2015-01-01";

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

function buildDailyBillableFromEntries(
  entries: ClockifyTimeEntry[],
  timezone: string,
  mondayDateKey: string,
  sundayDateKey: string,
): DailyBillableHours[] {
  const byKey = new Map<string, number>();
  for (const entry of entries) {
    const sec = getTimeEntrySeconds(entry);
    if (sec <= 0 || entry.billable === false) {
      continue;
    }
    const dayKey = formatInTimeZone(
      new Date(entry.timeInterval.start),
      timezone,
      "yyyy-MM-dd",
    );
    if (dayKey < mondayDateKey || dayKey > sundayDateKey) {
      continue;
    }
    byKey.set(dayKey, (byKey.get(dayKey) ?? 0) + sec);
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

function dateKeysToIsoRange(
  timezone: string,
  startDateKey: string,
  endDateKey: string,
): { startISO: string; endISO: string } {
  return {
    startISO: fromZonedTime(
      `${startDateKey}T00:00:00.000`,
      timezone,
    ).toISOString(),
    endISO: fromZonedTime(
      `${endDateKey}T23:59:59.999`,
      timezone,
    ).toISOString(),
  };
}

export function getDefaultProjectHoursRange(
  timezone: string,
): ProjectHoursRange {
  const now = new Date();
  const endDateKey = formatInTimeZone(now, timezone, "yyyy-MM-dd");
  const endNoon = fromZonedTime(`${endDateKey}T12:00:00.000`, timezone);
  const startDateKey = formatInTimeZone(
    subMonths(endNoon, PROJECT_TRACKED_LOOKBACK_MONTHS),
    timezone,
    "yyyy-MM-dd",
  );
  return { startDateKey, endDateKey };
}

export function parseProjectHoursDateKey(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }
  const parsed = new Date(`${trimmed}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return trimmed;
}

export async function buildProjectHoursForRange(config: {
  apiKey: string;
  workspaceId: string;
  timezone: string;
  startDateKey: string;
  endDateKey: string;
}): Promise<{
  rows: ProjectHoursRow[];
  projectRange: ProjectHoursRange;
}> {
  const client = new ClockifyClient({
    apiKey: config.apiKey,
    workspaceId: config.workspaceId,
    timezone: config.timezone,
  });
  const { startISO, endISO } = dateKeysToIsoRange(
    config.timezone,
    config.startDateKey,
    config.endDateKey,
  );

  const [rawProjects, trackedByProject] = await Promise.all([
    client.getProjects().catch(() => []),
    client
      .getProjectTrackedSecondsMap(startISO, endISO)
      .catch(() => new Map<string, number>()),
  ]);

  const enrichedProjects = rawProjects.map((project) => ({
    ...project,
    duration: trackedByProject.get(project.id) ?? 0,
  }));

  return {
    rows: mapProjectsToHoursRows(enrichedProjects),
    projectRange: {
      startDateKey: config.startDateKey,
      endDateKey: config.endDateKey,
    },
  };
}

async function fetchAllowlistedUserEntries(
  client: ClockifyClient,
  users: ClockifyUser[],
  startISO: string,
  endISO: string,
): Promise<Map<string, ClockifyTimeEntry[]>> {
  const entriesByUserId = new Map<string, ClockifyTimeEntry[]>();

  for (let i = 0; i < users.length; i += REQUEST_CONCURRENCY) {
    const batch = users.slice(i, i + REQUEST_CONCURRENCY);
    const batchEntries = await Promise.all(
      batch.map(async (user) => {
        try {
          const entries = await client.getUserTimeEntriesForRange(
            user.id,
            startISO,
            endISO,
          );
          return { userId: user.id, entries };
        } catch {
          return { userId: user.id, entries: [] as ClockifyTimeEntry[] };
        }
      }),
    );
    for (const row of batchEntries) {
      entriesByUserId.set(row.userId, row.entries);
    }
  }

  return entriesByUserId;
}

function sumBillableAcrossUsers(
  users: ClockifyUser[],
  entriesByUserId: Map<string, ClockifyTimeEntry[]>,
  timezone: string,
  startDateKey: string,
  endDateKey: string,
): { billableSeconds: number; nonBillableSeconds: number } {
  let billableSeconds = 0;
  let nonBillableSeconds = 0;
  for (const user of users) {
    const totals = sumBillableSecondsInDateKeyRange(
      entriesByUserId.get(user.id) ?? [],
      timezone,
      startDateKey,
      endDateKey,
    );
    billableSeconds += totals.billableSeconds;
    nonBillableSeconds += totals.nonBillableSeconds;
  }
  return { billableSeconds, nonBillableSeconds };
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
  const projectRange = getDefaultProjectHoursRange(reportTimezone);

  const userFetchStartISO = earliestISO(
    earliestISO(weekStartISO, lastWeekRange.weekStartISO),
    lastMonthRange.periodStartISO,
  );
  const userFetchEndISO = latestISO(weekEndISO, thisWeekRange.weekEndISO);

  const allUsers = await client.getAllUsers();
  const users = allUsers.filter(
    (user) => user.status === "ACTIVE" && isIncludedOnDashboard(user.name),
  );

  // Keep attendance off the project-hours critical path (org-wide scans are slow on Main).
  // ProjectsTable loads actual hours via /api/project-hours (default last 12 months).
  const [entriesByUserId, rawProjects] = await Promise.all([
    fetchAllowlistedUserEntries(
      client,
      users,
      userFetchStartISO,
      userFetchEndISO,
    ),
    client.getProjects().catch(() => []),
  ]);

  const projects = mapProjectsToHoursRows(
    rawProjects.map((project) => ({ ...project, duration: 0 })),
  );

  const thisWeekTotals = sumBillableAcrossUsers(
    users,
    entriesByUserId,
    reportTimezone,
    thisWeekRange.mondayDateKey,
    thisWeekRange.sundayDateKey,
  );
  const lastWeekTotals = sumBillableAcrossUsers(
    users,
    entriesByUserId,
    reportTimezone,
    lastWeekRange.mondayDateKey,
    lastWeekRange.sundayDateKey,
  );
  const thisMonthTotals = sumBillableAcrossUsers(
    users,
    entriesByUserId,
    reportTimezone,
    thisMonthRange.startDateKey,
    thisMonthRange.endDateKey,
  );
  const lastMonthTotals = sumBillableAcrossUsers(
    users,
    entriesByUserId,
    reportTimezone,
    lastMonthRange.startDateKey,
    lastMonthRange.endDateKey,
  );

  const thisWeekEntries = users.flatMap(
    (user) => entriesByUserId.get(user.id) ?? [],
  );
  const thisWeekDailyBillable = buildDailyBillableFromEntries(
    thisWeekEntries,
    reportTimezone,
    thisWeekRange.mondayDateKey,
    thisWeekRange.sundayDateKey,
  );
  const lastWeekDailyBillable = buildDailyBillableFromEntries(
    thisWeekEntries,
    reportTimezone,
    lastWeekRange.mondayDateKey,
    lastWeekRange.sundayDateKey,
  );

  const attendance: UserAttendance[] = [];
  const weeklyRows: WeeklyEmployeeRow[] = [];

  for (const user of users) {
    const entries = entriesByUserId.get(user.id) ?? [];
    const byDay = bucketSecondsByWorkspaceDay(entries, config.timezone);
    const secondsPerDay = dayKeys.map((k) => byDay.get(k) ?? 0);
    const trackedSeconds = byDay.get(todayKey) ?? 0;
    const weekTotalSeconds = secondsPerDay.reduce((s, v) => s + v, 0);

    attendance.push({
      userId: user.id,
      name: user.name,
      email: user.email,
      trackedSeconds,
      present: trackedSeconds > 0,
    });
    weeklyRows.push({
      userId: user.id,
      name: user.name,
      secondsPerDay,
      weekTotalSeconds,
    });
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
    projectRange,
    thisWeek: {
      rangeLabel: thisWeekRange.rangeLabel,
      billableSeconds: thisWeekTotals.billableSeconds,
      nonBillableSeconds: thisWeekTotals.nonBillableSeconds,
      dailyBillable: thisWeekDailyBillable,
    },
    lastWeek: {
      rangeLabel: lastWeekRange.rangeLabel,
      billableSeconds: lastWeekTotals.billableSeconds,
      nonBillableSeconds: lastWeekTotals.nonBillableSeconds,
      dailyBillable: lastWeekDailyBillable,
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

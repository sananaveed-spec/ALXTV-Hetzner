const CLOCKIFY_BASE_URL = "https://api.clockify.me/api/v1";
const CLOCKIFY_REPORTS_BASE_URL = "https://reports.api.clockify.me/v1";

export type ClockifyUser = {
  id: string;
  name: string;
  email: string;
  status: "ACTIVE" | "PENDING_EMAIL_VERIFICATION" | "DECLINED";
};

export type ClockifyTimeEntry = {
  id: string;
  billable?: boolean;
  timeInterval: {
    start: string;
    end: string | null;
    duration: string | null;
  };
};

type ClientConfig = {
  apiKey: string;
  workspaceId: string;
};

const MAX_RETRIES = 4;

function buildHeaders(apiKey: string): HeadersInit {
  return {
    "X-Api-Key": apiKey,
    "Content-Type": "application/json",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseIsoDurationToSeconds(duration: string | null): number {
  if (!duration) {
    return 0;
  }

  const match = duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) {
    return 0;
  }

  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);

  return hours * 3600 + minutes * 60 + seconds;
}

/** Clockify may return ISO durations (PT1H30M) or raw seconds as a string/number. */
export function parseClockifyDurationToSeconds(
  value: string | number | null | undefined,
): number {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
  }

  return parseIsoDurationToSeconds(trimmed);
}

export type ClockifyWorkspace = {
  id: string;
  name: string;
  workspaceSettings?: {
    lockTimeZone?: string;
  };
};

export type ClockifyProject = {
  id: string;
  name: string;
  archived?: boolean;
  template?: boolean;
  duration?: string | number | null;
  estimate?: {
    estimate?: string | number | null;
  } | null;
  timeEstimate?: {
    estimate?: string | number | null;
    active?: boolean;
  } | null;
};

function durationValueToSeconds(value: unknown): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) {
      return 0;
    }
    // Clockify Reports API (JSON export) uses seconds for duration/totalTime.
    return Math.round(value);
  }

  if (typeof value === "string") {
    return parseClockifyDurationToSeconds(value);
  }

  return 0;
}

/** Parse total duration from a Summary report JSON payload. */
export function sumBillableFromTimeEntries(
  entries: ClockifyTimeEntry[],
): { billableSeconds: number; nonBillableSeconds: number } {
  let billableSeconds = 0;
  let nonBillableSeconds = 0;

  for (const entry of entries) {
    const sec = getTimeEntrySeconds(entry);
    if (sec <= 0) {
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

function extractTimeEntriesFromDetailedReport(json: unknown): ClockifyTimeEntry[] {
  if (!json || typeof json !== "object") {
    return [];
  }

  const root = json as Record<string, unknown>;
  const raw =
    root.timeentries ??
    root.timeEntries ??
    root.entries ??
    root.timeentriesList;

  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((row) => row && typeof row === "object")
    .map((row) => {
      const record = row as Record<string, unknown>;
      const interval = record.timeInterval as ClockifyTimeEntry["timeInterval"] | undefined;
      return {
        id: String(record.id ?? record._id ?? ""),
        billable: record.billable as boolean | undefined,
        timeInterval: interval ?? {
          start: "",
          end: null,
          duration: null,
        },
      } satisfies ClockifyTimeEntry;
    })
    .filter((entry) => entry.timeInterval.start);
}

export type SummaryGroupRow = {
  name: string;
  seconds: number;
};

function rowDurationSeconds(record: Record<string, unknown>): number {
  return durationValueToSeconds(
    record.totalBillableTime ??
      record.totalTime ??
      record.billableTime ??
      record.duration,
  );
}

/** Rows from Summary report `groupOne` (e.g. grouped by DATE). */
export function extractSummaryGroupOneRows(json: unknown): SummaryGroupRow[] {
  if (!json || typeof json !== "object") {
    return [];
  }

  const groupOne = (json as Record<string, unknown>).groupOne;
  if (!Array.isArray(groupOne)) {
    return [];
  }

  return groupOne
    .filter((row) => row && typeof row === "object")
    .map((row) => {
      const record = row as Record<string, unknown>;
      const name = String(record.name ?? record._id ?? "").trim();
      return { name, seconds: rowDurationSeconds(record) };
    })
    .filter((row) => row.name && row.seconds > 0);
}

export function extractSummaryReportTotalSeconds(json: unknown): number {
  if (!json || typeof json !== "object") {
    return 0;
  }

  const root = json as Record<string, unknown>;
  const totals = root.totals;

  if (Array.isArray(totals) && totals.length > 0) {
    const grand = totals[0] as Record<string, unknown>;
    const grandTotal = durationValueToSeconds(
      grand.totalTime ?? grand.totalBillableTime ?? grand.duration,
    );
    if (grandTotal > 0) {
      return grandTotal;
    }

    return totals.reduce((sum, row) => {
      if (!row || typeof row !== "object") {
        return sum;
      }
      const record = row as Record<string, unknown>;
      return (
        sum +
        durationValueToSeconds(
          record.totalBillableTime ??
            record.totalTime ??
            record.billableTime ??
            record.duration,
        )
      );
    }, 0);
  }

  const groupOne = root.groupOne;
  if (Array.isArray(groupOne) && groupOne.length > 0) {
    return groupOne.reduce((sum, row) => {
      if (!row || typeof row !== "object") {
        return sum;
      }
      return sum + durationValueToSeconds((row as Record<string, unknown>).duration);
    }, 0);
  }

  if (totals && typeof totals === "object") {
    const record = totals as Record<string, unknown>;
    return durationValueToSeconds(
      record.totalTime ??
        record.totalBillableTime ??
        record.billableTime ??
        record.duration,
    );
  }

  return durationValueToSeconds(
    root.totalTime ?? root.totalBillableTime ?? root.billableTime ?? root.duration,
  );
}

export function getTimeEntrySeconds(entry: ClockifyTimeEntry): number {
  const durationInSeconds = parseClockifyDurationToSeconds(entry.timeInterval.duration);
  if (durationInSeconds > 0) {
    return durationInSeconds;
  }

  if (!entry.timeInterval.end) {
    const startMs = new Date(entry.timeInterval.start).getTime();
    const nowMs = Date.now();
    const diffMs = Math.max(nowMs - startMs, 0);
    return Math.floor(diffMs / 1000);
  }

  return 0;
}

export class ClockifyClient {
  private readonly apiKey: string;
  private readonly workspaceId: string;

  constructor(config: ClientConfig) {
    this.apiKey = config.apiKey;
    this.workspaceId = config.workspaceId;
  }

  private async requestWithRetry(
    url: string,
    init?: RequestInit,
  ): Promise<Response> {
    let attempt = 0;

    while (attempt <= MAX_RETRIES) {
      const response = await fetch(url, {
        ...init,
        headers: {
          ...buildHeaders(this.apiKey),
          ...(init?.headers ?? {}),
        },
        cache: "no-store",
      });

      if (response.status !== 429) {
        return response;
      }

      if (attempt === MAX_RETRIES) {
        return response;
      }

      const retryAfterHeader = response.headers.get("retry-after");
      const retryAfterSeconds = Number(retryAfterHeader);
      const retryMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? retryAfterSeconds * 1000
        : 1000 * 2 ** attempt;
      await sleep(retryMs);
      attempt += 1;
    }

    throw new Error("Clockify retry loop unexpectedly ended.");
  }

  private async fetchWithRetry(url: string | URL): Promise<Response> {
    return this.requestWithRetry(url.toString());
  }

  async getWorkspace(): Promise<ClockifyWorkspace> {
    const url = `${CLOCKIFY_BASE_URL}/workspaces/${this.workspaceId}`;
    const response = await this.fetchWithRetry(url);

    if (!response.ok) {
      throw new Error(`Clockify workspace request failed: ${response.status}`);
    }

    return (await response.json()) as ClockifyWorkspace;
  }

  /** Prefer workspace / profile timezone so Reports match the Clockify UI. */
  async resolveReportTimezone(configuredTimezone: string): Promise<string> {
    try {
      const workspace = await this.getWorkspace();
      const lockTimeZone = workspace.workspaceSettings?.lockTimeZone?.trim();
      if (lockTimeZone) {
        return lockTimeZone;
      }
    } catch {
      // fall through
    }

    try {
      const response = await this.fetchWithRetry(`${CLOCKIFY_BASE_URL}/user`);
      if (response.ok) {
        const user = (await response.json()) as {
          settings?: { timeZone?: string };
        };
        const userTz = user.settings?.timeZone?.trim();
        if (userTz) {
          return userTz;
        }
      }
    } catch {
      // fall through
    }

    return configuredTimezone;
  }

  async getAllUsers(): Promise<ClockifyUser[]> {
    const pageSize = 50;
    let page = 1;
    const users: ClockifyUser[] = [];

    while (true) {
      const url = new URL(
        `${CLOCKIFY_BASE_URL}/workspaces/${this.workspaceId}/users`,
      );
      url.searchParams.set("page-size", String(pageSize));
      url.searchParams.set("page", String(page));

      const response = await this.fetchWithRetry(url);

      if (!response.ok) {
        throw new Error(`Clockify users request failed: ${response.status}`);
      }

      const batch = (await response.json()) as ClockifyUser[];
      if (!Array.isArray(batch) || batch.length === 0) {
        break;
      }

      users.push(...batch);

      if (batch.length < pageSize) {
        break;
      }

      page += 1;
    }

    return users;
  }

  async getActiveUsers(): Promise<ClockifyUser[]> {
    const users = await this.getAllUsers();
    return users.filter((user) => user.status === "ACTIVE");
  }

  /**
   * Detailed Report — all workspace time entries in range (matches Clockify Reports).
   */
  async getDetailedReportBillableTotals(
    dateRangeStart: string,
    dateRangeEnd: string,
    timezone: string,
  ): Promise<{ billableSeconds: number; nonBillableSeconds: number }> {
    const url = `${CLOCKIFY_REPORTS_BASE_URL}/workspaces/${this.workspaceId}/reports/detailed`;
    const pageSize = 1000;
    const maxPages = 50;
    let page = 1;
    let billableSeconds = 0;
    let nonBillableSeconds = 0;

    while (page <= maxPages) {
      const response = await this.requestWithRetry(url, {
        method: "POST",
        body: JSON.stringify({
          dateRangeStart,
          dateRangeEnd,
          exportType: "JSON",
          timeZone: timezone,
          weekStart: "MONDAY",
          rounding: false,
          detailedFilter: {
            page,
            pageSize,
            sortColumn: "ID",
          },
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Clockify detailed report failed (${response.status}): ${body.slice(0, 200)}`,
        );
      }

      const json: unknown = await response.json();
      const entries = extractTimeEntriesFromDetailedReport(json);
      const pageTotals = sumBillableFromTimeEntries(entries);
      billableSeconds += pageTotals.billableSeconds;
      nonBillableSeconds += pageTotals.nonBillableSeconds;

      if (entries.length < pageSize) {
        break;
      }

      page += 1;
    }

    return { billableSeconds, nonBillableSeconds };
  }

  async getUserTimeEntriesForRange(
    userId: string,
    startISO: string,
    endISO: string,
  ): Promise<ClockifyTimeEntry[]> {
    const pageSize = 5000;
    let page = 1;
    const entries: ClockifyTimeEntry[] = [];

    while (true) {
      const url = new URL(
        `${CLOCKIFY_BASE_URL}/workspaces/${this.workspaceId}/user/${userId}/time-entries`,
      );
      url.searchParams.set("start", startISO);
      url.searchParams.set("end", endISO);
      url.searchParams.set("hydrated", "false");
      url.searchParams.set("page-size", String(pageSize));
      url.searchParams.set("page", String(page));

      const response = await this.fetchWithRetry(url);

      if (!response.ok) {
        throw new Error(`Clockify time entries request failed: ${response.status}`);
      }

      const batch = (await response.json()) as ClockifyTimeEntry[];
      if (!Array.isArray(batch) || batch.length === 0) {
        break;
      }

      entries.push(...batch);

      if (batch.length < pageSize) {
        break;
      }

      page += 1;
    }

    return entries;
  }

  /**
   * Workspace Summary report (same source as Clockify Reports → Summary).
   * `billable` filter: BILLABLE | NOT_BILLABLE (all users, all entries in range).
   */
  private async postSummaryReport(body: Record<string, unknown>): Promise<unknown> {
    const url = `${CLOCKIFY_REPORTS_BASE_URL}/workspaces/${this.workspaceId}/reports/summary`;
    const response = await this.requestWithRetry(url, {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(
        `Clockify summary report failed (${response.status}): ${errorBody.slice(0, 200)}`,
      );
    }

    return response.json();
  }

  async getSummaryReportSeconds(
    dateRangeStart: string,
    dateRangeEnd: string,
    timezone: string,
    billable: "BILLABLE" | "NOT_BILLABLE",
    dateRangeType: "THIS_WEEK" | "LAST_WEEK",
  ): Promise<number> {
    const json = await this.postSummaryReport({
      dateRangeStart,
      dateRangeEnd,
      dateRangeType,
      exportType: "JSON",
      timeZone: timezone,
      weekStart: "MONDAY",
      rounding: false,
      billable: billable === "BILLABLE",
      summaryFilter: {
        groups: ["PROJECT"],
        summaryChartType: "PROJECT",
        page: 1,
        pageSize: 1000,
      },
    });

    return extractSummaryReportTotalSeconds(json);
  }

  /** Same source as Clockify Summary chart grouped by day (billability filter). */
  async getSummaryBillableSecondsByDay(
    dateRangeStart: string,
    dateRangeEnd: string,
    timezone: string,
    billable: "BILLABLE" | "NOT_BILLABLE",
    dateRangeType: "THIS_WEEK" | "LAST_WEEK",
  ): Promise<SummaryGroupRow[]> {
    const json = await this.postSummaryReport({
      dateRangeStart,
      dateRangeEnd,
      dateRangeType,
      exportType: "JSON",
      timeZone: timezone,
      weekStart: "MONDAY",
      rounding: false,
      billable: billable === "BILLABLE",
      summaryFilter: {
        groups: ["DATE"],
        summaryChartType: "BILLABILITY",
        page: 1,
        pageSize: 50,
      },
    });

    return extractSummaryGroupOneRows(json);
  }

  async getWeekBillableTotals(
    dateRangeStart: string,
    dateRangeEnd: string,
    timezone: string,
    weeksAgo: 0 | 1,
  ): Promise<{ billableSeconds: number; nonBillableSeconds: number }> {
    const dateRangeType = weeksAgo === 0 ? "THIS_WEEK" : "LAST_WEEK";
    let billableSeconds = 0;
    let nonBillableSeconds = 0;
    let billableOk = false;
    let nonBillableOk = false;

    try {
      billableSeconds = await this.getSummaryReportSeconds(
        dateRangeStart,
        dateRangeEnd,
        timezone,
        "BILLABLE",
        dateRangeType,
      );
      billableOk = true;
    } catch {
      // try detailed report for billable only
      try {
        const detailed = await this.getDetailedReportBillableTotals(
          dateRangeStart,
          dateRangeEnd,
          timezone,
        );
        billableSeconds = detailed.billableSeconds;
        billableOk = true;
      } catch {
        billableOk = false;
      }
    }

    try {
      nonBillableSeconds = await this.getSummaryReportSeconds(
        dateRangeStart,
        dateRangeEnd,
        timezone,
        "NOT_BILLABLE",
        dateRangeType,
      );
      nonBillableOk = true;
    } catch {
      nonBillableOk = false;
    }

    if (billableOk || nonBillableOk) {
      return { billableSeconds, nonBillableSeconds };
    }

    return this.getDetailedReportBillableTotals(
      dateRangeStart,
      dateRangeEnd,
      timezone,
    );
  }

  async getUserTrackedSecondsForRange(
    userId: string,
    startISO: string,
    endISO: string,
  ): Promise<number> {
    const entries = await this.getUserTimeEntriesForRange(userId, startISO, endISO);
    return entries.reduce((sum, entry) => sum + getTimeEntrySeconds(entry), 0);
  }

  async getProjects(): Promise<ClockifyProject[]> {
    const pageSize = 5000;
    let page = 1;
    const projects: ClockifyProject[] = [];

    while (true) {
      const url = new URL(
        `${CLOCKIFY_BASE_URL}/workspaces/${this.workspaceId}/projects`,
      );
      url.searchParams.set("page-size", String(pageSize));
      url.searchParams.set("page", String(page));
      url.searchParams.set("archived", "false");

      const response = await this.fetchWithRetry(url);

      if (!response.ok) {
        throw new Error(`Clockify projects request failed: ${response.status}`);
      }

      const batch = (await response.json()) as ClockifyProject[];
      if (!Array.isArray(batch) || batch.length === 0) {
        break;
      }

      projects.push(...batch);

      if (batch.length < pageSize) {
        break;
      }

      page += 1;
    }

    return projects;
  }
}

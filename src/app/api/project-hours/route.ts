import {
  buildProjectHoursForRange,
  getDefaultProjectHoursRange,
  parseProjectHoursDateKey,
  type ProjectHoursRange,
} from "@/clockify/lib/attendance";
import type { ProjectHoursRow } from "@/clockify/lib/project-hours";
import {
  getClockifyConfig,
  getClockifyTimezone,
} from "@/clockify/lib/clockify";
import { createStaleCache } from "@/lib/stale-data-cache";
import { NextResponse } from "next/server";

export const maxDuration = 300;

type ProjectHoursPayload = {
  rows: ProjectHoursRow[];
  projectRange: ProjectHoursRange;
};

const projectHoursCache = createStaleCache<ProjectHoursPayload>();
const refreshByKey = new Map<string, Promise<ProjectHoursPayload>>();

function cacheKey(startDateKey: string, endDateKey: string): string {
  return `${startDateKey}:${endDateKey}`;
}

function startRefresh(
  apiKey: string,
  workspaceId: string,
  timezone: string,
  startDateKey: string,
  endDateKey: string,
): Promise<ProjectHoursPayload> {
  const key = cacheKey(startDateKey, endDateKey);
  const existing = refreshByKey.get(key);
  if (existing) {
    return existing;
  }

  const pending = buildProjectHoursForRange({
    apiKey,
    workspaceId,
    timezone,
    startDateKey,
    endDateKey,
  })
    .then((result) => {
      projectHoursCache.set(result);
      return result;
    })
    .finally(() => {
      refreshByKey.delete(key);
    });

  refreshByKey.set(key, pending);
  return pending;
}

export async function GET(request: Request) {
  const config = getClockifyConfig();
  const timezone = getClockifyTimezone();

  if (!config) {
    return NextResponse.json(
      {
        error:
          "Missing TIMESHEETS_API_TOKEN or TIMESHEETS_ORGANIZATION_ID in environment.",
      },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const defaults = getDefaultProjectHoursRange(timezone);
  const startDateKey =
    parseProjectHoursDateKey(url.searchParams.get("start")) ??
    defaults.startDateKey;
  const endDateKey =
    parseProjectHoursDateKey(url.searchParams.get("end")) ??
    defaults.endDateKey;

  if (startDateKey > endDateKey) {
    return NextResponse.json(
      { error: "Start date must be on or before end date." },
      { status: 400 },
    );
  }

  const stale = projectHoursCache.get();
  const staleMatches =
    stale &&
    stale.projectRange.startDateKey === startDateKey &&
    stale.projectRange.endDateKey === endDateKey;

  if (staleMatches && stale) {
    void startRefresh(
      config.apiKey,
      config.workspaceId,
      timezone,
      startDateKey,
      endDateKey,
    ).catch(() => undefined);
    return NextResponse.json(stale, {
      status: 200,
      headers: { "X-Stale-Data": "true" },
    });
  }

  try {
    const result = await startRefresh(
      config.apiKey,
      config.workspaceId,
      timezone,
      startDateKey,
      endDateKey,
    );
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (stale) {
      return NextResponse.json(stale, {
        status: 200,
        headers: { "X-Stale-Data": "true" },
      });
    }
    const message =
      error instanceof Error ? error.message : "Unknown Timesheets API error";
    return NextResponse.json(
      { error: "Failed to load project hours", details: message },
      { status: 502 },
    );
  }
}

import {
  buildDashboardSnapshot,
  type DashboardSnapshot,
} from "@/clockify/lib/attendance";
import {
  getClockifyConfig,
  getClockifyTimezone,
} from "@/clockify/lib/clockify";
import { createStaleCache } from "@/lib/stale-data-cache";
import { NextResponse } from "next/server";

export const maxDuration = 300;

const attendanceCache = createStaleCache<DashboardSnapshot>();
let refreshInFlight: Promise<DashboardSnapshot> | null = null;

function startRefresh(
  apiKey: string,
  workspaceId: string,
  timezone: string,
): Promise<DashboardSnapshot> {
  if (!refreshInFlight) {
    refreshInFlight = buildDashboardSnapshot({
      apiKey,
      workspaceId,
      timezone,
    })
      .then((snapshot) => {
        attendanceCache.set(snapshot);
        return snapshot;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

export async function GET() {
  const config = getClockifyConfig();
  const timezone = getClockifyTimezone();

  if (!config) {
    const stale = attendanceCache.get();
    if (stale) {
      return NextResponse.json(stale, {
        status: 200,
        headers: { "X-Stale-Data": "true" },
      });
    }

    return NextResponse.json(
      {
        error:
          "Missing TIMESHEETS_API_TOKEN or TIMESHEETS_ORGANIZATION_ID in environment.",
      },
      { status: 500 },
    );
  }

  const stale = attendanceCache.get();
  if (stale) {
    // Serve last good snapshot immediately; refresh in background (avoids CF 524).
    void startRefresh(config.apiKey, config.workspaceId, timezone).catch(
      () => undefined,
    );
    return NextResponse.json(stale, {
      status: 200,
      headers: { "X-Stale-Data": "true" },
    });
  }

  try {
    const snapshot = await startRefresh(
      config.apiKey,
      config.workspaceId,
      timezone,
    );
    return NextResponse.json(snapshot, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Timesheets API error";
    return NextResponse.json(
      { error: "Failed to load attendance data", details: message },
      { status: 502 },
    );
  }
}

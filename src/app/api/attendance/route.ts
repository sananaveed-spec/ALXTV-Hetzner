import { buildDashboardSnapshot, type DashboardSnapshot } from "@/clockify/lib/attendance";
import {
  getClockifyConfig,
  getClockifyTimezone,
} from "@/clockify/lib/clockify";
import { createStaleCache } from "@/lib/stale-data-cache";
import { NextResponse } from "next/server";

export const maxDuration = 300;

const attendanceCache = createStaleCache<DashboardSnapshot>();

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

  try {
    const snapshot = await buildDashboardSnapshot({
      apiKey: config.apiKey,
      workspaceId: config.workspaceId,
      timezone,
    });

    attendanceCache.set(snapshot);
    return NextResponse.json(snapshot, { status: 200 });
  } catch (error) {
    const stale = attendanceCache.get();
    if (stale) {
      return NextResponse.json(stale, {
        status: 200,
        headers: { "X-Stale-Data": "true" },
      });
    }

    const message =
      error instanceof Error ? error.message : "Unknown Timesheets API error";
    return NextResponse.json(
      { error: "Failed to load attendance data", details: message },
      { status: 502 },
    );
  }
}

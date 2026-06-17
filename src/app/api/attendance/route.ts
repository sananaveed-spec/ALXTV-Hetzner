import { buildDashboardSnapshot, type DashboardSnapshot } from "@/clockify/lib/attendance";
import { createStaleCache } from "@/lib/stale-data-cache";
import { NextResponse } from "next/server";

export const maxDuration = 300;

const attendanceCache = createStaleCache<DashboardSnapshot>();

export async function GET() {
  const apiKey = process.env.CLOCKIFY_API_KEY;
  const workspaceId = process.env.CLOCKIFY_WORKSPACE_ID;
  const timezone = process.env.CLOCKIFY_WORKSPACE_TIMEZONE ?? "UTC";

  if (!apiKey || !workspaceId) {
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
          "Missing CLOCKIFY_API_KEY or CLOCKIFY_WORKSPACE_ID in environment.",
      },
      { status: 500 },
    );
  }

  try {
    const snapshot = await buildDashboardSnapshot({
      apiKey,
      workspaceId,
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
      error instanceof Error ? error.message : "Unknown Clockify API error";
    return NextResponse.json(
      { error: "Failed to load attendance data", details: message },
      { status: 502 },
    );
  }
}

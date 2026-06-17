import { loadAlxTvGoogleSheetData } from "@/lib/alx-tv-google-sheet";
import { NextResponse } from "next/server";

export const maxDuration = 120;

export async function GET() {
  try {
    const data = await loadAlxTvGoogleSheetData();
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Google Sheets error";
    return NextResponse.json(
      { error: "Failed to load Google Sheet data", details: message },
      { status: 502 },
    );
  }
}

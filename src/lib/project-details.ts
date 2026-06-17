import {
  parseProjectDetailsValues,
  type ProjectDetailRow,
} from "@/lib/project-details-parse";
import { buildRangeForTab } from "@/lib/google-sheets-auth";
import { fetchSpreadsheetRange } from "@/lib/spreadsheet-values";

export type ProjectDetailsPayload = {
  rows: ProjectDetailRow[];
};

export async function fetchProjectDetailsPayload(
  spreadsheetId: string,
  tabName: string,
): Promise<ProjectDetailsPayload> {
  const rangeA1 = buildRangeForTab(tabName, "C14:G");
  const grid = await fetchSpreadsheetRange(spreadsheetId, rangeA1);
  const rows = parseProjectDetailsValues(grid.values);

  return { rows };
}

export type { ProjectDetailRow };

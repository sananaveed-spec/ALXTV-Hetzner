import {
  parseEngineerLoadBoards,
  type EngineerLoadBoard,
} from "@/lib/engineer-load-parse";
import { buildRangeForTab } from "@/lib/google-sheets-auth";
import { fetchSpreadsheetRange } from "@/lib/spreadsheet-values";

export type EngineerLoadPayload = {
  boards: EngineerLoadBoard[];
};

export async function fetchEngineerLoadPayload(
  spreadsheetId: string,
  tabName: string,
): Promise<EngineerLoadPayload> {
  const rangeA1 = buildRangeForTab(tabName, "A:ZZ");
  const grid = await fetchSpreadsheetRange(spreadsheetId, rangeA1);
  const boards = parseEngineerLoadBoards(grid.values);

  return {
    boards,
  };
}

export type { EngineerLoadBoard };

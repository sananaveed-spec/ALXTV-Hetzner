import { createSheetsClient } from "@/lib/google-sheets-auth";

export type SheetValuesResult = {
  range: string;
  majorDimension?: string | null;
  rowCount: number;
  columnCount: number;
  values: string[][];
};

function normalizeCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }
  return String(value);
}

export async function fetchSpreadsheetRange(
  spreadsheetId: string,
  range: string,
): Promise<SheetValuesResult> {
  const sheets = createSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const raw = res.data.values ?? [];
  const values = raw.map((row) =>
    (row ?? []).map((cell) => normalizeCell(cell)),
  );

  const columnCount = values.reduce(
    (max, row) => Math.max(max, row.length),
    0,
  );

  return {
    range,
    majorDimension: res.data.majorDimension,
    rowCount: values.length,
    columnCount,
    values,
  };
}

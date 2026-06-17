import { createSheetsClient } from "@/lib/google-sheets-auth";

export type SheetTabInfo = {
  sheetId: number;
  title: string;
  index: number;
};

export type SpreadsheetTabsResult = {
  spreadsheetTitle: string;
  tabCount: number;
  tabs: SheetTabInfo[];
};

export async function fetchSpreadsheetTabs(
  spreadsheetId: string,
): Promise<SpreadsheetTabsResult> {
  const sheets = createSheetsClient();

  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "properties.title,sheets.properties(sheetId,title,index)",
  });

  const spreadsheetTitle =
    res.data.properties?.title ?? "(untitled spreadsheet)";
  const rawSheets = res.data.sheets ?? [];

  const tabs: SheetTabInfo[] = rawSheets
    .map((s) => {
      const p = s.properties;
      if (
        p?.sheetId === undefined ||
        p?.sheetId === null ||
        !p?.title ||
        p.index === undefined ||
        p.index === null
      ) {
        return null;
      }
      return {
        sheetId: p.sheetId,
        title: p.title,
        index: p.index,
      };
    })
    .filter((t): t is SheetTabInfo => t !== null)
    .sort((a, b) => a.index - b.index);

  return {
    spreadsheetTitle,
    tabCount: tabs.length,
    tabs,
  };
}

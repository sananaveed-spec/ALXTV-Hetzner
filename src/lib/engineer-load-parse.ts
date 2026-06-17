function cell(row: string[] | undefined, col: number): string {
  return (row?.[col] ?? "").trim();
}

export type EngineerLoadBoard = {
  /** Row 1 in this block: name cells joined with a space. */
  name: string;
  /**
   * Data rows in fixed order: [Project Name, Stage, PRIORITY] — values are taken
   * from the sheet row using column mapping from row-2 header labels.
   */
  rows: [string, string, string][];
};

type ColumnRole = "project" | "stage" | "priority";

function classifyHeader(raw: string): ColumnRole | null {
  const t = raw.trim().toLowerCase();
  if (!t) {
    return null;
  }
  if (t.includes("priority")) {
    return "priority";
  }
  if (t.includes("project") && t.includes("name")) {
    return "project";
  }
  if (t === "project") {
    return "project";
  }
  if (t.includes("project status")) {
    return "stage";
  }
  if (t.includes("stage")) {
    return "stage";
  }
  if (t.includes("status")) {
    return "stage";
  }
  return null;
}

/**
 * Maps the three sheet columns (offsets 0–2 within the block) to fixed display order:
 * [Project Name, Stage, PRIORITY] → which sheet offset feeds each slot.
 */
function resolveDataColumnOrder(
  rawHeaders: [string, string, string],
): [number, number, number] {
  const roles: (ColumnRole | null)[] = rawHeaders.map((h) => classifyHeader(h));
  const colByRole: Partial<Record<ColumnRole, number>> = {};
  const used = new Set<number>();

  for (let i = 0; i < 3; i++) {
    const r = roles[i];
    if (!r || colByRole[r] !== undefined || used.has(i)) {
      continue;
    }
    colByRole[r] = i;
    used.add(i);
  }

  const fillOrder: ColumnRole[] = ["project", "stage", "priority"];
  for (const r of fillOrder) {
    if (colByRole[r] !== undefined) {
      continue;
    }
    for (let i = 0; i < 3; i++) {
      if (!used.has(i)) {
        colByRole[r] = i;
        used.add(i);
        break;
      }
    }
  }

  return [colByRole.project!, colByRole.stage!, colByRole.priority!];
}

function maxColumnIndex(values: string[][]): number {
  return values.reduce((m, row) => Math.max(m, row.length - 1), -1);
}

/** First column index >= fromCol where at least one of row1[c..c+2] is non-empty. */
function findNextBlockStart(
  row1: string[],
  fromCol: number,
  maxCol: number,
): number | null {
  for (let c = fromCol; c <= maxCol; c++) {
    const t0 = cell(row1, c);
    const t1 = cell(row1, c + 1);
    const t2 = cell(row1, c + 2);
    if (t0 || t1 || t2) {
      return c;
    }
  }
  return null;
}

export function normalizeStage(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isFinalReportSent(s: string): boolean {
  return (
    s.includes("final report sent") ||
    s.includes("final report") ||
    s === "fr sent" ||
    s === "report sent"
  );
}

function isInProgress(s: string): boolean {
  if (!s || isFinalReportSent(s)) {
    return false;
  }
  return (
    s.includes("in progress") ||
    s.includes("in progess") || // common spreadsheet typo (missing "r")
    s.includes("in-progress") ||
    s.includes("in-progess") ||
    /^in\s+progre?s{1,2}\b/.test(s) ||
    s === "inprogress" ||
    s === "inprogess" ||
    s === "progress" ||
    s.startsWith("progress ") ||
    s.endsWith(" progress")
  );
}

function isHold(s: string): boolean {
  return s === "hold" || s === "on hold" || s.startsWith("on hold ");
}

/** Sort key for Stage: In progress → Hold → Final report sent → other. */
export function stageSortRank(stage: string): number {
  const s = normalizeStage(stage);
  if (!s) {
    return 3;
  }
  if (isInProgress(s)) {
    return 0;
  }
  if (isHold(s)) {
    return 1;
  }
  if (isFinalReportSent(s)) {
    return 2;
  }
  return 3;
}

export function sortRowsByStage(
  rows: [string, string, string][],
): [string, string, string][] {
  const buckets: [string, string, string][][] = [[], [], [], []];
  for (const row of rows) {
    const rank = Math.min(stageSortRank(row[1]), 3);
    buckets[rank]!.push(row);
  }
  return [...buckets[0]!, ...buckets[1]!, ...buckets[2]!, ...buckets[3]!];
}

function parseOneEngineerBlock(
  values: string[][],
  startCol: number,
): EngineerLoadBoard {
  const row1 = values[0] ?? [];
  const nameParts = [0, 1, 2]
    .map((d) => cell(row1, startCol + d))
    .filter(Boolean);
  const name = nameParts.join(" ").trim();

  const row2 = values[1] ?? [];
  const rawHeaders: [string, string, string] = [
    cell(row2, startCol),
    cell(row2, startCol + 1),
    cell(row2, startCol + 2),
  ];
  const [iProject, iStage, iPriority] = resolveDataColumnOrder(rawHeaders);

  const rows: [string, string, string][] = [];
  for (let r = 2; r < values.length; r++) {
    const row = values[r] ?? [];
    const v0 = cell(row, startCol);
    const v1 = cell(row, startCol + 1);
    const v2 = cell(row, startCol + 2);
    if (!v0 && !v1 && !v2) {
      break;
    }
    const raw = [v0, v1, v2];
    rows.push([
      raw[iProject] ?? "",
      raw[iStage] ?? "",
      raw[iPriority] ?? "",
    ]);
  }

  return { name, rows: sortRowsByStage(rows) };
}

/**
 * Multiple engineers on one sheet, each using **3 adjacent columns** of source data.
 * The next block starts at the next column where row 1 has any text in a 3-wide
 * window; then `startCol + 3` for the next lead.
 *
 * Row 2 labels are matched to roles (project name, stage, priority) so values
 * appear under fixed headers: Project Name, Stage, PRIORITY.
 */
export function parseEngineerLoadBoards(values: string[][]): EngineerLoadBoard[] {
  if (values.length === 0) {
    return [];
  }

  const row1 = values[0] ?? [];
  const maxCol = Math.max(maxColumnIndex(values), row1.length - 1, 2);
  const boards: EngineerLoadBoard[] = [];
  let from = 0;

  while (from <= maxCol) {
    const start = findNextBlockStart(row1, from, maxCol);
    if (start === null) {
      break;
    }
    boards.push(parseOneEngineerBlock(values, start));
    from = start + 3;
  }

  return boards;
}

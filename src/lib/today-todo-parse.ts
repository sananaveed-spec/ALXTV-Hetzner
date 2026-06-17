function cell(row: string[] | undefined, col: number): string {
  return (row?.[col] ?? "").trim();
}

export type TodayTodoRow = {
  reminder: string;
  reminderDate: string;
  projectName: string;
};

type ColumnRole = "reminder" | "reminderDate" | "projectName";

function normalizeHeader(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

function classifyHeader(raw: string): ColumnRole | null {
  const t = normalizeHeader(raw);
  if (!t) {
    return null;
  }
  if (t.includes("reminder") && t.includes("date")) {
    return "reminderDate";
  }
  if (t === "reminder") {
    return "reminder";
  }
  if (t.includes("project") && t.includes("name")) {
    return "projectName";
  }
  if (t === "project") {
    return "projectName";
  }
  return null;
}

function findHeaderRow(values: string[][]): {
  headerRowIndex: number;
  columns: Record<ColumnRole, number>;
} | null {
  const scanLimit = Math.min(values.length, 20);

  for (let rowIndex = 0; rowIndex < scanLimit; rowIndex++) {
    const row = values[rowIndex] ?? [];
    const columns: Partial<Record<ColumnRole, number>> = {};

    for (let colIndex = 0; colIndex < row.length; colIndex++) {
      const role = classifyHeader(cell(row, colIndex));
      if (role && columns[role] === undefined) {
        columns[role] = colIndex;
      }
    }

    if (
      columns.reminder !== undefined &&
      columns.reminderDate !== undefined &&
      columns.projectName !== undefined
    ) {
      return {
        headerRowIndex: rowIndex,
        columns: columns as Record<ColumnRole, number>,
      };
    }
  }

  return null;
}

/**
 * Parses the "Today TO DO LIST" tab — finds a header row with Reminder,
 * Reminder Date, and Project Name, then reads data rows below it.
 */
export function parseTodayTodoValues(values: string[][]): TodayTodoRow[] {
  const header = findHeaderRow(values);
  if (!header) {
    return [];
  }

  const { headerRowIndex, columns } = header;
  const rows: TodayTodoRow[] = [];

  for (let rowIndex = headerRowIndex + 1; rowIndex < values.length; rowIndex++) {
    const row = values[rowIndex];
    const reminder = cell(row, columns.reminder);
    const reminderDate = cell(row, columns.reminderDate);
    const projectName = cell(row, columns.projectName);

    if (!reminder && !reminderDate && !projectName) {
      break;
    }

    rows.push({ reminder, reminderDate, projectName });
  }

  return rows;
}

function cell(row: string[] | undefined, col: number): string {
  return (row?.[col] ?? "").trim();
}

export type ProjectDetailRow = {
  name: string;
  engineer: string;
  status: string;
  invoiced: string;
};

/**
 * Parses PROJECTS sheet range C14:G — columns C, E, F, G (indices 0, 2, 3, 4).
 * Stops at the first row where column C (Name) is empty.
 */
export function parseProjectDetailsValues(values: string[][]): ProjectDetailRow[] {
  const rows: ProjectDetailRow[] = [];

  for (const row of values) {
    const name = cell(row, 0);
    if (!name) {
      break;
    }
    rows.push({
      name,
      engineer: cell(row, 2),
      status: cell(row, 3),
      invoiced: cell(row, 4),
    });
  }

  return rows;
}

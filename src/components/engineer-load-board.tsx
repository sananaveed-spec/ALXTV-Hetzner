import {
  sortRowsByStage,
  type EngineerLoadBoard,
} from "@/lib/engineer-load-parse";

type SlotProps = {
  board: EngineerLoadBoard;
};

export function EngineerSlot({ board }: SlotProps) {
  const hasName = Boolean(board.name);
  const rows = sortRowsByStage(board.rows);
  const hasRows = rows.length > 0;

  return (
    <section className="engineerBoard">
      {hasName ? (
        <h2 className="engineerBoardName">{board.name}</h2>
      ) : null}

      <div className="engineerBoardTableWrap">
        <table className="engineerBoardTable">
          <thead>
            <tr>
              <th className="engineerBoardTableSerial">#</th>
              <th>Project Name</th>
              <th>Stage</th>
              <th>PRIORITY</th>
            </tr>
          </thead>
          <tbody>
            {hasRows ? (
              rows.map((row, ri) => (
                <tr key={ri}>
                  <td className="engineerBoardTableSerial">{ri + 1}</td>
                  <td>{row[0]}</td>
                  <td>{row[1]}</td>
                  <td>{row[2]}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="engineerBoardTableEmpty">
                  No data rows (all three columns in this block are empty from row
                  3 onward).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EmptyBoards() {
  return (
    <section className="engineerBoard engineerBoardEmpty">
      <p>No engineers found.</p>
      <p className="hint">
        Each lead uses 3 side-by-side columns: row 1 = name, row 2 = headings, row 3+
        = data until a row is blank in all three cells. The next lead is detected on
        the next column where row 1 has any text (so blocks can start at T:U:V, not
        only A:C, D:F, …).
      </p>
    </section>
  );
}

type StackProps = {
  boards: EngineerLoadBoard[];
};

/** Renders every lead at once (no rotation). */
export default function EngineerLoadBoardView({ boards }: StackProps) {
  if (boards.length === 0) {
    return <EmptyBoards />;
  }

  return (
    <div className="engineerBoardStack">
      {boards.map((board, i) => (
        <EngineerSlot key={i} board={board} />
      ))}
    </div>
  );
}

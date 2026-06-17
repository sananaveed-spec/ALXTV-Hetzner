import DashboardSection from "@/components/dashboard-section";
import type { ProjectDetailRow } from "@/lib/project-details-parse";

type Props = {
  rows: ProjectDetailRow[];
};

export default function ProjectDetailsTable({ rows }: Props) {
  return (
    <DashboardSection
      title="Project Details"
      subtitle="Project name, engineer, status, and invoiced from the PROJECTS tab (row 14 onward)."
    >
      <div className="engineerBoardTableWrap">
        <table className="engineerBoardTable projectDetailsTable">
          <thead>
            <tr>
              <th>Project</th>
              <th>Engineer</th>
              <th>Status</th>
              <th>Invoiced</th>
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((row, ri) => (
                <tr key={ri}>
                  <td>{row.name}</td>
                  <td>{row.engineer}</td>
                  <td>{row.status}</td>
                  <td>{row.invoiced}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="engineerBoardTableEmpty">
                  No project rows found from row 14 in column C onward.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </DashboardSection>
  );
}

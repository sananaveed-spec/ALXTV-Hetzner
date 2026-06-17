import AutoRefresh from "@/components/auto-refresh";
import DashboardSection from "@/components/dashboard-section";
import EngineerLoadSlider from "@/components/engineer-load-slider";
import TodayTodoTable from "@/components/today-todo-table";
import { mapGoogleSheetsError } from "@/lib/google-api-errors";
import { fetchEngineerLoadPayload } from "@/lib/engineer-load";
import { fetchTodayTodoPayload } from "@/lib/today-todo";
import {
  getEngineerLoadSlideMsFromEnv,
  getEngineerLoadTabFromEnv,
  getSpreadsheetIdFromEnv,
  getTodayTodoSlideMsFromEnv,
  getTodayTodoTabFromEnv,
} from "@/lib/google-sheets-auth";
import { dataRefreshMsForLeadCount, MIN_DATA_REFRESH_MS } from "@/lib/kiosk-timing";

export const dynamic = "force-dynamic";

export default async function GoogleSheetPanelPage() {
  const spreadsheetId = getSpreadsheetIdFromEnv();
  const engineerTabName = getEngineerLoadTabFromEnv();
  const todayTodoTabName = getTodayTodoTabFromEnv();
  const slideMs = getEngineerLoadSlideMsFromEnv();
  const todayTodoSlideMs = getTodayTodoSlideMsFromEnv();

  if (!spreadsheetId) {
    return (
      <main className="screen tvGoogleSheetPanel">
        <AutoRefresh refreshMs={MIN_DATA_REFRESH_MS} />
        <section className="errorCard">
          <p>Set GOOGLE_SPREADSHEET_ID in .env.local.</p>
        </section>
      </main>
    );
  }

  let engineerPayload: Awaited<ReturnType<typeof fetchEngineerLoadPayload>>;
  let todayTodoPayload: Awaited<ReturnType<typeof fetchTodayTodoPayload>> | null =
    null;
  let todayTodoError: ReturnType<typeof mapGoogleSheetsError> | null = null;

  try {
    engineerPayload = await fetchEngineerLoadPayload(
      spreadsheetId,
      engineerTabName,
    );
  } catch (error) {
    const mapped = mapGoogleSheetsError(error);
    return (
      <main className="screen tvGoogleSheetPanel">
        <AutoRefresh refreshMs={MIN_DATA_REFRESH_MS} />
        <section className="errorCard">
          <p>Could not read tab &quot;{engineerTabName}&quot;.</p>
          <p>{mapped.message}</p>
          {mapped.details ? <p className="hint">{mapped.details}</p> : null}
        </section>
      </main>
    );
  }

  try {
    todayTodoPayload = await fetchTodayTodoPayload(
      spreadsheetId,
      todayTodoTabName,
    );
  } catch (error) {
    todayTodoError = mapGoogleSheetsError(error);
  }

  const leadCount = engineerPayload.boards.length;
  const dataRefreshMs = dataRefreshMsForLeadCount(leadCount, slideMs);

  return (
    <main className="screen tvGoogleSheetPanel">
      <AutoRefresh refreshMs={dataRefreshMs} />

      {todayTodoError ? (
        <DashboardSection
          title="Today TO DO LIST"
          subtitle={`Could not read tab "${todayTodoTabName}".`}
          className="errorCard"
        >
          <p>Expected columns: Reminder, Reminder Date, Project Name.</p>
          <p>{todayTodoError.message}</p>
          {todayTodoError.details ? (
            <p className="hint">{todayTodoError.details}</p>
          ) : null}
        </DashboardSection>
      ) : (
        <TodayTodoTable
          rows={todayTodoPayload!.rows}
          todayLabel={todayTodoPayload!.todayLabel}
          slideMs={todayTodoSlideMs}
        />
      )}

      <DashboardSection
        title="Engineer Workload"
        className="dashboardSectionEngineerLoad"
      >
        <EngineerLoadSlider boards={engineerPayload.boards} slideMs={slideMs} />
      </DashboardSection>
    </main>
  );
}

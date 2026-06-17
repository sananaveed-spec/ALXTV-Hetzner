import DashboardView from "@/clockify/components/dashboard-view";

export const dynamic = "force-dynamic";

export default function ClockifyPanelPage() {
  return (
    <main className="screen kioskScreen">
      <DashboardView />
    </main>
  );
}

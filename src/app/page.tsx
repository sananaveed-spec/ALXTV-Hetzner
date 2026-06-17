import AlxTvDashboard from "@/components/alx-tv-dashboard";
import { loadAlxTvGoogleSheetData } from "@/lib/alx-tv-google-sheet";
import "@/app/panels/clockify/clockify.css";
import "@/app/panels/google-sheet/google-sheet.css";

export const dynamic = "force-dynamic";

export default async function Home() {
  const googleSheet = await loadAlxTvGoogleSheetData();

  return <AlxTvDashboard googleSheet={googleSheet} />;
}

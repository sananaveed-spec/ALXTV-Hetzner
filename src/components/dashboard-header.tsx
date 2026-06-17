"use client";

import { formatDataRefreshInterval } from "@/lib/kiosk-timing";
import { useEffect, useState } from "react";

export const DASHBOARD_TITLE = "Project Management Dashboard";

type Props = {
  generatedAt: string;
  refreshMs: number;
  statusCenter?: string;
};

export default function DashboardHeader({
  generatedAt,
  refreshMs,
  statusCenter,
}: Props) {
  const [mountedAt] = useState(() => Date.now());
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState<number | null>(
    null,
  );

  useEffect(() => {
    const tick = () => {
      const remainingMs = mountedAt + refreshMs - Date.now();
      setSecondsUntilRefresh(Math.max(0, Math.ceil(remainingMs / 1000)));
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [mountedAt, refreshMs]);

  const updatedLabel =
    statusCenter ??
    `Updated: ${new Date(generatedAt).toLocaleString()}`;

  return (
    <header className="header">
      <h1>{DASHBOARD_TITLE}</h1>
      <p className="dashboardStatus">{updatedLabel}</p>
      <p className="dashboardStatus">
        Full dashboard refreshes every {formatDataRefreshInterval(refreshMs)}
        {secondsUntilRefresh !== null
          ? ` · Next refresh in ${secondsUntilRefresh}s`
          : null}
      </p>
    </header>
  );
}

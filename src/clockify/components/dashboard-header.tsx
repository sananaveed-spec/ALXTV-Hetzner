"use client";

import { formatDataRefreshInterval } from "@/clockify/lib/kiosk-timing";
import { useEffect, useState } from "react";
import styles from "@/clockify/components/dashboard-header.module.css";

export const DASHBOARD_TITLE = "Timesheet Overview";

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
    statusCenter ?? `Updated: ${new Date(generatedAt).toLocaleString()}`;

  return (
    <header className={styles.header}>
      <h1>{DASHBOARD_TITLE}</h1>
      <p className={styles.dashboardStatus}>{updatedLabel}</p>
      <p className={styles.dashboardStatus}>
        Full dashboard refreshes every {formatDataRefreshInterval(refreshMs)}
        {secondsUntilRefresh !== null
          ? ` · Next refresh in ${secondsUntilRefresh}s`
          : null}
      </p>
    </header>
  );
}

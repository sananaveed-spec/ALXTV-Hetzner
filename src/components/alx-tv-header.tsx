"use client";

import { formatDataRefreshInterval } from "@/clockify/lib/kiosk-timing";
import Image from "next/image";
import { useEffect, useState } from "react";
import styles from "./alx-tv-header.module.css";

type Props = {
  generatedAt: string;
  refreshMs: number;
  statusCenter?: string;
  /** Bumped after each successful background refresh to restart the countdown. */
  refreshEpoch?: number;
};

export default function AlxTvHeader({
  generatedAt,
  refreshMs,
  statusCenter,
  refreshEpoch = 0,
}: Props) {
  const [mountedAt, setMountedAt] = useState(() => Date.now());
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState<number | null>(
    null,
  );

  useEffect(() => {
    setMountedAt(Date.now());
  }, [refreshEpoch]);

  useEffect(() => {
    if (refreshMs <= 0) {
      setSecondsUntilRefresh(null);
      return;
    }

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
    <header className={styles.header}>
      <div className={styles.logoWrap}>
        <Image
          src="/allumiax-logo.jpeg"
          alt="AllumiaX"
          width={180}
          height={40}
          className={styles.logo}
          priority
        />
      </div>
      <p className={styles.updated}>{updatedLabel}</p>
      <p className={styles.refresh}>
        {refreshMs > 0
          ? `Full dashboard refreshes every ${formatDataRefreshInterval(refreshMs)}${
              secondsUntilRefresh !== null
                ? ` · Next refresh in ${secondsUntilRefresh}s`
                : ""
            }`
          : "Live data updates when source data changes"}
      </p>
    </header>
  );
}

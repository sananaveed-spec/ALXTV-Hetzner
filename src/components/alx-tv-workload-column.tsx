"use client";

import DashboardSection from "@/components/dashboard-section";
import EngineerLoadSlider from "@/components/engineer-load-slider";
import type { AlxTvGoogleSheetData } from "@/lib/alx-tv-google-sheet";
import { useCallback, useState } from "react";
import styles from "./alx-tv-dashboard.module.css";

type Props = {
  googleSheet: AlxTvGoogleSheetData;
  sharedSlideTick?: number;
};

export default function AlxTvWorkloadColumn({
  googleSheet,
  sharedSlideTick,
}: Props) {
  const [engineerSlideMeta, setEngineerSlideMeta] = useState({
    index: 0,
    count: 0,
    name: "",
  });
  const handleEngineerSlideMetaChange = useCallback(
    (meta: { index: number; count: number; name: string }) => {
      setEngineerSlideMeta(meta);
    },
    [],
  );

  if (!googleSheet.ok) {
    return (
      <aside className={styles.workloadColumn}>
        <section className="errorCard">
          <p>{googleSheet.message}</p>
          {googleSheet.details ? (
            <p className="hint">{googleSheet.details}</p>
          ) : null}
        </section>
      </aside>
    );
  }

  return (
    <aside className={`${styles.workloadColumn} tvEngineerSection`}>
      <DashboardSection
        title={
          engineerSlideMeta.name
            ? `${engineerSlideMeta.name} Workload`
            : "Engineer Workload"
        }
        titleRight={
          engineerSlideMeta.count > 0 ? (
            <span className="tvEngineerSectionCounter">
              {engineerSlideMeta.index + 1} / {engineerSlideMeta.count}
            </span>
          ) : null
        }
        className="dashboardSectionEngineerLoad"
      >
        <div className={styles.engineerFill}>
          <EngineerLoadSlider
            boards={googleSheet.engineerBoards}
            slideMs={googleSheet.engineerSlideMs}
            onSlideMetaChange={handleEngineerSlideMetaChange}
            syncTick={sharedSlideTick}
          />
        </div>
      </DashboardSection>
    </aside>
  );
}

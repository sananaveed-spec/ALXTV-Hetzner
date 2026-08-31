"use client";



import {

  MonthVsMonthGroup,

  TodayAttendanceGroup,

  WeekVsWeekGroup,

} from "@/clockify/components/metrics-row";

import clockifyStyles from "@/clockify/components/dashboard-view.module.css";

import ProjectsTable from "@/clockify/components/projects-table";

import UnderHoursRotator from "@/clockify/components/under-hours-rotator";

import { UNDER_HOURS_ROTATE_MS } from "@/clockify/lib/kiosk-timing";

import type { DashboardSnapshot } from "@/clockify/lib/attendance";

import {

  isIncludedInClockifyUpdateRotator,

  rotatorAllowlistSortIndex,

} from "@/clockify/lib/employee-exclusions";

import { buildEmployeeWeekdaySlides } from "@/clockify/lib/under-hours";

import AlxTvCenterColumn from "@/components/alx-tv-center-column";
import AlxTvHeader from "@/components/alx-tv-header";
import AlxTvWorkloadColumn from "@/components/alx-tv-workload-column";

import type { AlxTvGoogleSheetData } from "@/lib/alx-tv-google-sheet";
import {
  readStoredClockifySnapshot,
  readStoredGoogleSheet,
  writeStoredClockifySnapshot,
  writeStoredGoogleSheet,
} from "@/lib/client-data-cache";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import styles from "./alx-tv-dashboard.module.css";



const LOAD_TIMEOUT_MS = 180_000;

const LIVE_DATA_POLL_MS = 60_000;



function isDashboardSnapshot(value: unknown): value is DashboardSnapshot {

  if (!value || typeof value !== "object") {

    return false;

  }

  const snapshot = value as DashboardSnapshot;

  return (

    typeof snapshot.todayLabel === "string" &&

    typeof snapshot.thisWeek?.billableSeconds === "number" &&

    typeof snapshot.lastWeek?.billableSeconds === "number" &&

    typeof snapshot.thisMonth?.billableSeconds === "number" &&

    typeof snapshot.lastMonth?.billableSeconds === "number" &&

    Array.isArray(snapshot.projects)

  );

}



function isGoogleSheetData(value: unknown): value is AlxTvGoogleSheetData {

  if (!value || typeof value !== "object") {

    return false;

  }

  return "ok" in value && typeof (value as AlxTvGoogleSheetData).dataRefreshMs === "number";

}

function clockifySignature(snapshot: DashboardSnapshot): string {
  const { generatedAt: _generatedAt, ...stableSnapshot } = snapshot;
  return JSON.stringify(stableSnapshot);
}

function googleSheetSignature(sheet: AlxTvGoogleSheetData): string {
  return JSON.stringify(sheet);
}



type Props = {

  googleSheet: AlxTvGoogleSheetData;

};



export default function AlxTvDashboard({
  googleSheet: initialGoogleSheet,
}: Props) {
  const initialGoogleSheetOk = initialGoogleSheet.ok;

  const [data, setData] = useState<DashboardSnapshot | null>(null);

  const [googleSheet, setGoogleSheet] =

    useState<AlxTvGoogleSheetData>(initialGoogleSheet);

  const [error, setError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);

  const [isRefreshing, setIsRefreshing] = useState(false);

  const [refreshEpoch, setRefreshEpoch] = useState(0);
  const [liveUpdatedAt, setLiveUpdatedAt] = useState<string | null>(null);

  const [loadingSeconds, setLoadingSeconds] = useState(0);

  const [sharedSlideTick, setSharedSlideTick] = useState(0);

  const refreshingRef = useRef(false);
  const hadCachedPreviewRef = useRef(false);
  const clockifySignatureRef = useRef<string | null>(null);
  const googleSheetSignatureRef = useRef<string | null>(
    googleSheetSignature(initialGoogleSheet),
  );

  useLayoutEffect(() => {
    const staleClockify = readStoredClockifySnapshot<DashboardSnapshot>();
    if (staleClockify && isDashboardSnapshot(staleClockify)) {
      setData(staleClockify);
      clockifySignatureRef.current = clockifySignature(staleClockify);
      hadCachedPreviewRef.current = true;
      setLoading(false);
    }

    if (initialGoogleSheet.ok) {
      setGoogleSheet(initialGoogleSheet);
      googleSheetSignatureRef.current = googleSheetSignature(initialGoogleSheet);
    } else {
      const staleSheet = readStoredGoogleSheet<AlxTvGoogleSheetData>();
      if (staleSheet && isGoogleSheetData(staleSheet) && staleSheet.ok) {
        setGoogleSheet(staleSheet);
        googleSheetSignatureRef.current = googleSheetSignature(staleSheet);
      }
    }
  }, [initialGoogleSheet]);

  useEffect(() => {
    if (initialGoogleSheet.ok) {
      writeStoredGoogleSheet(initialGoogleSheet);
    }
  }, [initialGoogleSheet]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setSharedSlideTick((t) => t + 1);
    }, UNDER_HOURS_ROTATE_MS);

    return () => window.clearInterval(id);
  }, []);

  const fetchClockify = useCallback(async (): Promise<DashboardSnapshot> => {

    const response = await fetch("/api/attendance", {

      cache: "no-store",

      signal: AbortSignal.timeout(LOAD_TIMEOUT_MS),

    });

    if (!response.ok) {

      const body = (await response.json().catch(() => ({}))) as {

        error?: string;

        details?: string;

      };

      throw new Error(body.details ?? body.error ?? `HTTP ${response.status}`);

    }



    const snapshot: unknown = await response.json();

    if (!isDashboardSnapshot(snapshot)) {

      throw new Error("Server returned outdated Timesheets data.");

    }



    return snapshot;

  }, []);



  const fetchGoogleSheet = useCallback(async (): Promise<AlxTvGoogleSheetData> => {

    const response = await fetch("/api/google-sheet", {

      cache: "no-store",

      signal: AbortSignal.timeout(LOAD_TIMEOUT_MS),

    });

    if (!response.ok) {

      const body = (await response.json().catch(() => ({}))) as {

        error?: string;

        details?: string;

      };

      throw new Error(body.details ?? body.error ?? `HTTP ${response.status}`);

    }



    const sheetData: unknown = await response.json();

    if (!isGoogleSheetData(sheetData)) {

      throw new Error("Server returned invalid Google Sheet data.");

    }



    return sheetData;

  }, []);



  const refreshDashboard = useCallback(async () => {
    if (refreshingRef.current) {
      return;
    }

    refreshingRef.current = true;

    try {
      const [clockifyResult, sheetResult] = await Promise.allSettled([
        fetchClockify(),
        fetchGoogleSheet(),
      ]);

      let changed = false;

      if (clockifyResult.status === "fulfilled") {
        const nextSignature = clockifySignature(clockifyResult.value);
        if (nextSignature !== clockifySignatureRef.current) {
          clockifySignatureRef.current = nextSignature;
          setData(clockifyResult.value);
          writeStoredClockifySnapshot(clockifyResult.value);
          changed = true;
        }
        setError(null);
      } else {
        const staleClockify = readStoredClockifySnapshot<DashboardSnapshot>();
        if (staleClockify && isDashboardSnapshot(staleClockify)) {
          setData(staleClockify);
          clockifySignatureRef.current = clockifySignature(staleClockify);
        }
      }

      if (sheetResult.status === "fulfilled") {
        const nextSignature = googleSheetSignature(sheetResult.value);
        if (nextSignature !== googleSheetSignatureRef.current) {
          googleSheetSignatureRef.current = nextSignature;
          setGoogleSheet(sheetResult.value);
          if (sheetResult.value.ok) {
            writeStoredGoogleSheet(sheetResult.value);
          }
          changed = true;
        }
      } else {
        const staleSheet = readStoredGoogleSheet<AlxTvGoogleSheetData>();
        if (staleSheet && isGoogleSheetData(staleSheet) && staleSheet.ok) {
          setGoogleSheet(staleSheet);
          googleSheetSignatureRef.current = googleSheetSignature(staleSheet);
        }
      }

      if (changed) {
        setLiveUpdatedAt(new Date().toISOString());
        setRefreshEpoch((epoch) => epoch + 1);
      }
    } finally {
      refreshingRef.current = false;
      setIsRefreshing(false);
    }
  }, [fetchClockify, fetchGoogleSheet]);

  const loadInitial = useCallback(async () => {
    if (hadCachedPreviewRef.current) {
      setIsRefreshing(true);
    }

    const [clockifyResult, sheetResult] = await Promise.allSettled([
      fetchClockify(),
      fetchGoogleSheet(),
    ]);

    let clockifyData: DashboardSnapshot | null = null;
    let sheetData: AlxTvGoogleSheetData | null = null;

    if (clockifyResult.status === "fulfilled") {
      clockifyData = clockifyResult.value;
      clockifySignatureRef.current = clockifySignature(clockifyData);
      writeStoredClockifySnapshot(clockifyData);
    } else {
      const staleClockify = readStoredClockifySnapshot<DashboardSnapshot>();
      if (staleClockify && isDashboardSnapshot(staleClockify)) {
        clockifyData = staleClockify;
        clockifySignatureRef.current = clockifySignature(staleClockify);
      }
    }

    if (sheetResult.status === "fulfilled") {
      sheetData = sheetResult.value;
      googleSheetSignatureRef.current = googleSheetSignature(sheetData);
      if (sheetData.ok) {
        writeStoredGoogleSheet(sheetData);
      }
    } else {
      const staleSheet = readStoredGoogleSheet<AlxTvGoogleSheetData>();
      if (staleSheet && isGoogleSheetData(staleSheet) && staleSheet.ok) {
        sheetData = staleSheet;
        googleSheetSignatureRef.current = googleSheetSignature(staleSheet);
      }
    }

    if (clockifyData) {
      setData(clockifyData);
      setError(null);
    } else if (clockifyResult.status === "rejected") {
      const message =
        clockifyResult.reason instanceof Error
          ? clockifyResult.reason.message
          : "Unknown error";
      setError(message);
    }

    if (sheetData) {
      setGoogleSheet(sheetData);
    } else if (!initialGoogleSheetOk) {
      const staleSheet = readStoredGoogleSheet<AlxTvGoogleSheetData>();
      if (staleSheet && isGoogleSheetData(staleSheet) && staleSheet.ok) {
        setGoogleSheet(staleSheet);
        googleSheetSignatureRef.current = googleSheetSignature(staleSheet);
      }
    }

    setLoading(false);
    setIsRefreshing(false);
  }, [fetchClockify, fetchGoogleSheet, initialGoogleSheetOk]);



  useEffect(() => {

    void loadInitial();

  }, [loadInitial]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void refreshDashboard();
    }, LIVE_DATA_POLL_MS);

    return () => window.clearInterval(id);
  }, [refreshDashboard]);



  useEffect(() => {

    if (!loading || data) {

      setLoadingSeconds(0);

      return;

    }



    const startedAt = Date.now();

    const id = window.setInterval(() => {

      setLoadingSeconds(Math.floor((Date.now() - startedAt) / 1000));

    }, 1000);



    return () => window.clearInterval(id);

  }, [loading, data]);



  const rotatorSlides = useMemo(() => {

    if (!data) {

      return [];

    }



    return buildEmployeeWeekdaySlides(data.weekly, data.timezone)

      .filter((slide) => isIncludedInClockifyUpdateRotator(slide.name))

      .sort(

        (a, b) =>

          rotatorAllowlistSortIndex(a.name) -

            rotatorAllowlistSortIndex(b.name) ||

          a.name.localeCompare(b.name),

      );

  }, [data]);



  if (loading && !data) {

    return (

      <main className={styles.tvScreen}>

        <AlxTvHeader

          generatedAt={new Date().toISOString()}

          refreshMs={0}

          statusCenter="Loading dashboard…"

        />

        <section className={clockifyStyles.metricCard}>

          <p>Loading dashboard data…</p>

          <p className={clockifyStyles.metricHint}>

            {loadingSeconds > 0

              ? `Still loading… ${loadingSeconds}s`

              : "First load can take up to a minute."}

          </p>

        </section>

      </main>

    );

  }



  if (error && !data) {

    return (

      <main className={styles.tvScreen}>

        <AlxTvHeader

          generatedAt={new Date().toISOString()}

          refreshMs={0}

          statusCenter="Could not load data"

        />

        <section className={clockifyStyles.errorCard}>

          <p>Could not load Timesheets data.</p>

          <p>{error}</p>

        </section>

        <div className={styles.mainContent}>
          <div className={styles.centerColumn}>
            <AlxTvCenterColumn googleSheet={googleSheet} />
          </div>
          <AlxTvWorkloadColumn googleSheet={googleSheet} />
        </div>

      </main>

    );

  }



  if (!data) {

    return null;

  }



  return (

    <main className={styles.tvScreen}>

      <AlxTvHeader

        generatedAt={data.generatedAt}

        refreshMs={0}

        refreshEpoch={refreshEpoch}

        statusCenter={

          isRefreshing

            ? `Updated: ${new Date(data.generatedAt).toLocaleString()} · Refreshing…`
            : liveUpdatedAt
              ? `Updated: ${new Date(liveUpdatedAt).toLocaleString()}`

            : undefined

        }

      />



      <section
        className={`${styles.metricsRow} ${clockifyStyles.kioskMetrics}`}
      >
        <TodayAttendanceGroup
          todayLabel={data.todayLabel}
          presentCount={data.presentCount}
          absentCount={data.absentCount}
          totalUsers={data.totalUsers}
          totalTrackedSeconds={data.totalTrackedSeconds}
        />
        <WeekVsWeekGroup thisWeek={data.thisWeek} lastWeek={data.lastWeek} />
        <MonthVsMonthGroup thisMonth={data.thisMonth} lastMonth={data.lastMonth} />
      </section>

      <div className={styles.mainContent}>
        <div className={styles.projectsColumn}>
          <ProjectsTable
            rows={data.projects}
            compact
            fillContainer
            syncTick={sharedSlideTick}
          />
        </div>

        <div className={styles.centerColumn}>
          <AlxTvCenterColumn googleSheet={googleSheet} />
          <div className={styles.centerEmployees}>
            <UnderHoursRotator
              slides={rotatorSlides}
              compact
              syncTick={sharedSlideTick}
            />
          </div>
        </div>

        <AlxTvWorkloadColumn
          googleSheet={googleSheet}
          sharedSlideTick={sharedSlideTick}
        />
      </div>

    </main>

  );

}



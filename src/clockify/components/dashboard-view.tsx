"use client";

import DashboardHeader from "@/clockify/components/dashboard-header";
import styles from "@/clockify/components/dashboard-view.module.css";
import ProjectsTable from "@/clockify/components/projects-table";
import UnderHoursRotator from "@/clockify/components/under-hours-rotator";
import {
  formatDurationClockify,
  getTimeSharePercents,
  type DashboardSnapshot,
  type WeekBillableHours,
} from "@/clockify/lib/attendance";
import {
  isIncludedInClockifyUpdateRotator,
  rotatorAllowlistSortIndex,
} from "@/clockify/lib/employee-exclusions";
import { dataRefreshMsForRotatorEmployeeCount } from "@/clockify/lib/kiosk-timing";
import { buildEmployeeWeekdaySlides } from "@/clockify/lib/under-hours";
import {
  readStoredClockifySnapshot,
  writeStoredClockifySnapshot,
} from "@/lib/client-data-cache";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";

function formatHours(seconds: number): string {
  return `${(seconds / 3600).toFixed(2)}h`;
}

function TodayAttendanceGroup({
  todayLabel,
  presentCount,
  absentCount,
  totalUsers,
  totalTrackedSeconds,
}: {
  todayLabel: string;
  presentCount: number;
  absentCount: number;
  totalUsers: number;
  totalTrackedSeconds: number;
}) {
  return (
    <article className={`${styles.metricCard} ${styles.metricCardWeekGroup}`}>
      <h2>Today</h2>
      <p className={styles.metricHint}>{todayLabel}</p>
      <div className={`${styles.groupMetricsRow} ${styles.groupMetricsRowFour}`}>
        <div className={styles.groupMetricBox}>
          <h3>Present</h3>
          <p className={styles.metricValue}>{presentCount}</p>
        </div>
        <div className={styles.groupMetricBox}>
          <h3>Absent</h3>
          <p className={styles.metricValue}>{absentCount}</p>
        </div>
        <div className={styles.groupMetricBox}>
          <h3>Total Users</h3>
          <p className={styles.metricValue}>{totalUsers}</p>
        </div>
        <div className={styles.groupMetricBox}>
          <h3>Total Hours</h3>
          <p className={styles.metricValue}>{formatHours(totalTrackedSeconds)}</p>
        </div>
      </div>
    </article>
  );
}

function WeekBillableGroup({ title, week }: { title: string; week: WeekBillableHours }) {
  const share = getTimeSharePercents(
    week.billableSeconds,
    week.nonBillableSeconds,
  );

  return (
    <article className={`${styles.metricCard} ${styles.metricCardWeekGroup}`}>
      <h2>{title}</h2>
      <p className={styles.metricHint}>{week.rangeLabel}</p>
      <div className={`${styles.groupMetricsRow} ${styles.groupMetricsRowTwo}`}>
        <div className={styles.groupMetricBox}>
          <h3>Billable</h3>
          <p className={`${styles.metricValue} ${styles.metricValueBillable}`}>
            {share.billable}
          </p>
          <p className={styles.metricHoursSub}>
            {formatDurationClockify(week.billableSeconds)} h
          </p>
        </div>
        <div className={styles.groupMetricBox}>
          <h3>Non-Billable</h3>
          <p className={`${styles.metricValue} ${styles.metricValueNonBillable}`}>
            {share.nonBillable}
          </p>
          <p className={styles.metricHoursSub}>
            {formatDurationClockify(week.nonBillableSeconds)} h
          </p>
        </div>
      </div>
    </article>
  );
}

const LOAD_TIMEOUT_MS = 180_000;

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

export default function DashboardView() {
  const [data, setData] = useState<DashboardSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadingSeconds, setLoadingSeconds] = useState(0);

  useLayoutEffect(() => {
    const stale = readStoredClockifySnapshot<DashboardSnapshot>();
    if (stale && isDashboardSnapshot(stale)) {
      setData(stale);
      setLoading(false);
    }
  }, []);
  const reloadAfterEmployeeCycle = useCallback(() => {
    window.setTimeout(() => {
      window.location.reload();
    }, 2000);
  }, []);

  const load = useCallback(async () => {
    const hadPreview = Boolean(readStoredClockifySnapshot());
    if (hadPreview) {
      setIsRefreshing(true);
    }

    try {
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
        throw new Error(
          "Server returned outdated data. Run npm run build, then restart the server on port 3010.",
        );
      }

      setData(snapshot);
      writeStoredClockifySnapshot(snapshot);
      setError(null);
    } catch (loadError) {
      const stale = readStoredClockifySnapshot<DashboardSnapshot>();
      if (stale && isDashboardSnapshot(stale)) {
        setData(stale);
        return;
      }

      const message =
        loadError instanceof Error ? loadError.message : "Unknown error";
      setError((current) => current ?? message);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

  const refreshMs = useMemo(
    () => dataRefreshMsForRotatorEmployeeCount(rotatorSlides.length),
    [rotatorSlides.length],
  );

  if (loading && !data) {
    return (
      <>
        <DashboardHeader
          generatedAt={new Date().toISOString()}
          refreshMs={dataRefreshMsForRotatorEmployeeCount(0)}
          statusCenter="Loading dashboard…"
        />
        <section className={styles.metricCard}>
          <p>Fetching attendance and projects from Clockify.</p>
          <p className={styles.metricHint}>
            {loadingSeconds > 0
              ? `Still loading… ${loadingSeconds}s (usually under 30s)`
              : "First load can take up to a minute."}
          </p>
        </section>
      </>
    );
  }

  if (error && !data) {
    return (
      <>
        <DashboardHeader
          generatedAt={new Date().toISOString()}
          refreshMs={dataRefreshMsForRotatorEmployeeCount(0)}
          statusCenter="Could not load data"
        />
        <section className={styles.errorCard}>
          <p>Could not load data.</p>
          <p>{error}</p>
        </section>
      </>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className={styles.kioskDashboard}>
      <DashboardHeader
        generatedAt={data.generatedAt}
        refreshMs={refreshMs}
        statusCenter={
          isRefreshing
            ? `Updated: ${new Date(data.generatedAt).toLocaleString()} · Refreshing…`
            : undefined
        }
      />

      <section
        className={`${styles.metricsGrid} ${styles.metricsGridInsightGroups} ${styles.kioskMetrics}`}
      >
        <TodayAttendanceGroup
          todayLabel={data.todayLabel}
          presentCount={data.presentCount}
          absentCount={data.absentCount}
          totalUsers={data.totalUsers}
          totalTrackedSeconds={data.totalTrackedSeconds}
        />
        <WeekBillableGroup title="This Week" week={data.thisWeek} />
        <WeekBillableGroup title="Last Week" week={data.lastWeek} />
        <WeekBillableGroup title="This Month" week={data.thisMonth} />
        <WeekBillableGroup title="Last Month" week={data.lastMonth} />
      </section>

      <div className={styles.kioskEmployees}>
        <UnderHoursRotator
          slides={rotatorSlides}
          onCycleComplete={reloadAfterEmployeeCycle}
          compact
        />
      </div>

      <div className={styles.kioskProjects}>
        <ProjectsTable rows={data.projects} compact />
      </div>
    </div>
  );
}

"use client";

import styles from "@/clockify/components/dashboard-view.module.css";
import {
  formatDurationClockify,
  getTimeSharePercents,
  type WeekBillableHours,
} from "@/clockify/lib/attendance";

function formatHours(seconds: number): string {
  return `${(seconds / 3600).toFixed(2)}h`;
}

export function TodayAttendanceGroup({
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

export function WeekBillableGroup({
  title,
  week,
}: {
  title: string;
  week: WeekBillableHours;
}) {
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

export function WeekVsWeekGroup({
  thisWeek,
  lastWeek,
}: {
  thisWeek: WeekBillableHours;
  lastWeek: WeekBillableHours;
}) {
  return (
    <PeriodVsPeriodGroup
      title="This Week vs Last Week"
      currentLabel="This Week"
      current={thisWeek}
      previousLabel="Last Week"
      previous={lastWeek}
    />
  );
}

export function MonthVsMonthGroup({
  thisMonth,
  lastMonth,
}: {
  thisMonth: WeekBillableHours;
  lastMonth: WeekBillableHours;
}) {
  return (
    <PeriodVsPeriodGroup
      title="This Month vs Last Month"
      currentLabel="This Month"
      current={thisMonth}
      previousLabel="Last Month"
      previous={lastMonth}
    />
  );
}

function BillablePieChart({
  billableSeconds,
  nonBillableSeconds,
}: {
  billableSeconds: number;
  nonBillableSeconds: number;
}) {
  const share = getTimeSharePercents(billableSeconds, nonBillableSeconds);
  const total = billableSeconds + nonBillableSeconds;
  const billablePct = total > 0 ? (billableSeconds / total) * 100 : 0;
  const background =
    total > 0
      ? `conic-gradient(#22c55e 0 ${billablePct}%, #f59e0b ${billablePct}% 100%)`
      : "#0f172a";

  return (
    <div
      className={styles.billablePieChart}
      style={{ background }}
      role="img"
      aria-label={`Billable ${share.billable}, Non-Billable ${share.nonBillable}`}
    />
  );
}

function PeriodPieColumn({
  label,
  week,
}: {
  label: string;
  week: WeekBillableHours;
}) {
  const share = getTimeSharePercents(
    week.billableSeconds,
    week.nonBillableSeconds,
  );

  return (
    <div className={styles.weekComparePieColumn}>
      <span className={styles.weekComparePeriodLabel}>{label}</span>
      <BillablePieChart
        billableSeconds={week.billableSeconds}
        nonBillableSeconds={week.nonBillableSeconds}
      />
      <ul className={styles.pieLegend}>
        <li className={styles.pieLegendBillable}>
          Billable {share.billable} ({formatDurationClockify(week.billableSeconds)} h)
        </li>
        <li className={styles.pieLegendNonBillable}>
          Non-Billable {share.nonBillable} ({formatDurationClockify(week.nonBillableSeconds)} h)
        </li>
      </ul>
      <span className={styles.metricHint}>{week.rangeLabel}</span>
    </div>
  );
}

function PeriodVsPeriodGroup({
  title,
  currentLabel,
  current,
  previousLabel,
  previous,
}: {
  title: string;
  currentLabel: string;
  current: WeekBillableHours;
  previousLabel: string;
  previous: WeekBillableHours;
}) {
  return (
    <article className={`${styles.metricCard} ${styles.metricCardWeekGroup}`}>
      <h2>{title}</h2>
      <div className={styles.weekComparePies}>
        <PeriodPieColumn label={currentLabel} week={current} />
        <PeriodPieColumn label={previousLabel} week={previous} />
      </div>
    </article>
  );
}

export function MetricsRow({
  todayLabel,
  presentCount,
  absentCount,
  totalUsers,
  totalTrackedSeconds,
  thisWeek,
  lastWeek,
  thisMonth,
  lastMonth,
}: {
  todayLabel: string;
  presentCount: number;
  absentCount: number;
  totalUsers: number;
  totalTrackedSeconds: number;
  thisWeek: WeekBillableHours;
  lastWeek: WeekBillableHours;
  thisMonth: WeekBillableHours;
  lastMonth: WeekBillableHours;
}) {
  return (
    <section
      className={`${styles.metricsGrid} ${styles.metricsGridInsightGroups} ${styles.kioskMetrics}`}
    >
      <TodayAttendanceGroup
        todayLabel={todayLabel}
        presentCount={presentCount}
        absentCount={absentCount}
        totalUsers={totalUsers}
        totalTrackedSeconds={totalTrackedSeconds}
      />
      <WeekBillableGroup title="This Week" week={thisWeek} />
      <WeekBillableGroup title="Last Week" week={lastWeek} />
      <WeekBillableGroup title="This Month" week={thisMonth} />
      <WeekBillableGroup title="Last Month" week={lastMonth} />
    </section>
  );
}

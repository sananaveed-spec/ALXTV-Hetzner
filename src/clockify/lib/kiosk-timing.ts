/** Time each employee slide is shown in the under-hours rotator. */
export const UNDER_HOURS_ROTATE_MS = 15_000;

/** Never refresh full-page data more often than this (fresh Clockify snapshot). */
export const MIN_DATA_REFRESH_MS = 60_000;

/** Estimated duration of one full employee rotator cycle (for status countdown). */
export function dataRefreshMsForRotatorEmployeeCount(employeeCount: number): number {
  if (employeeCount <= 0) {
    return MIN_DATA_REFRESH_MS;
  }
  return employeeCount * UNDER_HOURS_ROTATE_MS;
}

/** Human-readable refresh interval for the dashboard status line. */
export function formatDataRefreshInterval(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (seconds === 0) {
    return `${minutes} min`;
  }
  return `${minutes} min ${seconds}s`;
}

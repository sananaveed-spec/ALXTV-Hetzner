/** Default time each lead is visible on the home carousel. */
export const DEFAULT_SLIDE_MS = 30_000;

/** Rows shown per page in the Today TO DO LIST table. */
export const TODAY_TODO_ROWS_PER_PAGE = 10;

/** Time each Today TO DO LIST page is visible when more than one page exists. */
export const TODAY_TODO_SLIDE_MS = 10_000;

/** Never refresh full-page data more often than this. */
export const MIN_DATA_REFRESH_MS = 60_000;

/** Extra delay after a full carousel cycle before reload. */
const REFRESH_TAIL_MS = 15_000;

/**
 * Schedule a full page reload only after every lead has had a full slide slot,
 * so refresh does not cut the carousel mid-cycle.
 */
export function dataRefreshMsForLeadCount(
  leadCount: number,
  slideMs: number,
): number {
  if (leadCount <= 1) {
    return MIN_DATA_REFRESH_MS;
  }
  const safeSlideMs =
    Number.isFinite(slideMs) && slideMs >= 2000 ? slideMs : DEFAULT_SLIDE_MS;
  return Math.max(
    MIN_DATA_REFRESH_MS,
    leadCount * safeSlideMs + REFRESH_TAIL_MS,
  );
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

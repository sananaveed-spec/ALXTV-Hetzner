/**
 * Only these Clockify users appear on the dashboard (present, absent, weekly,
 * rotator, and billable totals). Names must match Clockify display names.
 */
const DASHBOARD_ALLOWLIST = [
  "Areeb",
  "hasan.mujahid",
  "irsa.sarfaraz",
  "m.sulaiman",
  "rufia.noor",
  "mustafa.abdullah",
  "nawab.naveed",
  "muhammad.waleed",
  "zahir.hussain",
  "zain.abideen",
  "Wareesha Azwar",
  "Sohail",
] as const;

export function normalizePersonName(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/[\u00A0\u202F\u2007\uFEFF]/g, " ")
    .replace(/([^\s])\(/g, "$1 (")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const DASHBOARD_ALLOWLIST_NORMALIZED = new Set(
  DASHBOARD_ALLOWLIST.map((n) => normalizePersonName(n)),
);

export function isIncludedOnDashboard(name: string): boolean {
  return DASHBOARD_ALLOWLIST_NORMALIZED.has(normalizePersonName(name));
}

export function isExcludedFromAllLists(name: string): boolean {
  return !isIncludedOnDashboard(name);
}

export function isExcludedFromClockifyUpdateRotator(name: string): boolean {
  return !isIncludedOnDashboard(name);
}

/** True when a person should appear in the Clockify update rotator. */
export function isIncludedInClockifyUpdateRotator(name: string): boolean {
  return isIncludedOnDashboard(name);
}

/** Sort key for rotator slides; lower values appear first. */
export function rotatorAllowlistSortIndex(name: string): number {
  const normalized = normalizePersonName(name);
  const index = DASHBOARD_ALLOWLIST.findIndex(
    (n) => normalizePersonName(n) === normalized,
  );
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

export function getDashboardAllowlist(): readonly string[] {
  return DASHBOARD_ALLOWLIST;
}

export function isAllowlistPlaceholderUserId(userId: string): boolean {
  return userId.startsWith("allowlist:");
}

export function compareDashboardNames(a: string, b: string): number {
  const byAllowlist =
    rotatorAllowlistSortIndex(a) - rotatorAllowlistSortIndex(b);
  return byAllowlist !== 0 ? byAllowlist : a.localeCompare(b);
}

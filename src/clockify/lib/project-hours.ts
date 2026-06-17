import {
  parseClockifyDurationToSeconds,
  type ClockifyProject,
} from "@/clockify/lib/clockify";

export type ProjectHoursRow = {
  projectId: string;
  name: string;
  estimateSeconds: number;
  trackedSeconds: number;
};

function prefixBeforeDash(rawName: string): string | null {
  const dashIndex = rawName.indexOf("-");
  if (dashIndex === -1) {
    return null;
  }

  const prefix = rawName.slice(0, dashIndex).trim();
  return prefix || null;
}

function extractProjectYear(rawName: string): number | null {
  const prefix = prefixBeforeDash(rawName);
  if (!prefix) {
    return null;
  }

  // Project code convention:
  // - Prefix is mixed text+numbers before "-"
  // - Numeric part encodes year in its first two digits (e.g. 23001 -> 2023)
  const trailingDigits = prefix.match(/(\d+)$/)?.[1];
  if (!trailingDigits || trailingDigits.length < 2) {
    return null;
  }

  const yy = Number.parseInt(trailingDigits.slice(0, 2), 10);
  if (!Number.isFinite(yy)) {
    return null;
  }

  return 2000 + yy;
}

function pickProjectDisplayName(rawName: string): string | null {
  // Rule:
  // - Look at everything before the first `-`
  // - Keep only projects where that prefix ends with a digit
  // - Display the full original project name
  const prefix = prefixBeforeDash(rawName);
  if (!prefix) {
    return null;
  }

  const endsWithNumber = /\d$/.test(prefix);
  if (!endsWithNumber) {
    return null;
  }

  return rawName.trim();
}

function shouldExcludeProject(rawName: string): boolean {
  return rawName.trim().toUpperCase().startsWith("ESR");
}

function parseProjectEstimateSeconds(project: ClockifyProject): number {
  const fromTimeEstimate = parseClockifyDurationToSeconds(
    project.timeEstimate?.estimate,
  );
  if (fromTimeEstimate > 0) {
    return fromTimeEstimate;
  }

  return parseClockifyDurationToSeconds(project.estimate?.estimate);
}

export function mapProjectsToHoursRows(
  projects: ClockifyProject[],
): ProjectHoursRow[] {
  return projects
    .filter((project) => !project.archived && !project.template)
    .map((project) => {
      const pickedName = pickProjectDisplayName(project.name);
      const projectYear = extractProjectYear(project.name);
      if (!pickedName || shouldExcludeProject(pickedName)) {
        return null;
      }

      return {
        projectYear,
        projectId: project.id,
        name: pickedName,
        estimateSeconds: parseProjectEstimateSeconds(project),
        trackedSeconds: parseClockifyDurationToSeconds(project.duration),
      };
    })
    .filter(
      (row): row is ProjectHoursRow & { projectYear: number | null } =>
        row !== null,
    )
    .sort((a, b) => {
      const yearA = a.projectYear ?? -1;
      const yearB = b.projectYear ?? -1;
      if (yearA !== yearB) {
        return yearB - yearA;
      }
      return a.name.localeCompare(b.name);
    })
    .map(({ projectYear: _projectYear, ...row }) => row);
}

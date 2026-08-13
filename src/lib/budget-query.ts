/**
 * Shared query helpers for the team-scoped budget endpoints
 * (/api/budget/daily and /api/budget/agenda), which both accept an optional
 * `personIds` query param to filter stories/videos down to a set of assigned
 * people (used by the team-filtered Columns/Agenda views).
 */

/** Parse a comma-separated `personIds` query param into a list, or null if absent. */
export function parsePersonIds(searchParams: URLSearchParams): string[] | null {
  const raw = searchParams.get("personIds");
  if (!raw) return null;
  const ids = raw.split(",").filter(Boolean);
  return ids.length > 0 ? ids : null;
}

/** Prisma where-clause fragment scoping a story/video to assignees in `personIds`. */
export function personAssignmentFilter(personIds: string[] | null) {
  return personIds
    ? { assignments: { some: { personId: { in: personIds } } } }
    : {};
}

/**
 * Client-side counterpart: derives a stable SWR cache-key fragment and a
 * `&personIds=...` query-string suffix from an optional personIds list.
 * Shared by ColumnsView and AgendaView so their team-scoping wiring can't
 * drift apart.
 */
export function personIdsQueryParts(personIds?: string[]): { cacheKey: string | null; querySuffix: string } {
  if (!personIds || personIds.length === 0) return { cacheKey: null, querySuffix: "" };
  const joined = personIds.join(",");
  return { cacheKey: joined, querySuffix: `&personIds=${joined}` };
}

/** Parse a comma-separated `excludeReporterIds` query param into a list, or null if absent. */
export function parseExcludeReporterIds(searchParams: URLSearchParams): string[] | null {
  const raw = searchParams.get("excludeReporterIds");
  if (!raw) return null;
  const ids = raw.split(",").filter(Boolean);
  return ids.length > 0 ? ids : null;
}

/**
 * Prisma where-clause fragment for the "hide reporter team" filter on the
 * Daily view. A story/video is HIDDEN only when it has at least one REPORTER
 * assignment AND every REPORTER assignee is in `excludeIds` — items with no
 * reporter at all, and items with at least one non-excluded reporter, always
 * pass. Non-reporter roles (EDITOR/PHOTOGRAPHER/VIDEOGRAPHER/OTHER) never
 * affect the result either way. This is deliberately a separate helper from
 * `personAssignmentFilter` — the semantics are inverted (exclude-if-all-match
 * vs. include-if-any-match) and role-restricted, not a variant of it.
 */
export function reporterTeamExclusionFilter(excludeIds: string[] | null) {
  return excludeIds
    ? {
        OR: [
          { assignments: { none: { role: "REPORTER" } } },
          { assignments: { some: { role: "REPORTER", personId: { notIn: excludeIds } } } },
        ],
      }
    : {};
}

/**
 * Client-side counterpart to `reporterTeamExclusionFilter`: derives a stable
 * SWR cache-key fragment and a `&excludeReporterIds=...` query-string suffix
 * from an optional list of excluded person IDs. Shared by ColumnsView and
 * AgendaView, mirroring `personIdsQueryParts`.
 */
export function excludeReporterIdsQueryParts(excludeIds?: string[]): { cacheKey: string | null; querySuffix: string } {
  if (!excludeIds || excludeIds.length === 0) return { cacheKey: null, querySuffix: "" };
  const joined = excludeIds.join(",");
  return { cacheKey: `ex:${joined}`, querySuffix: `&excludeReporterIds=${joined}` };
}

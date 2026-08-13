/**
 * Shared query helpers for the team-scoped budget endpoints
 * (/api/budget/daily and /api/budget/agenda), which both accept an optional
 * `personIds` query param (any-role team-scoping, used by the team-filtered
 * Columns/Agenda views) and an optional `excludeReporterIds` query param
 * (the Daily view's "hide reporter team" filter).
 */

/** Parse a comma-separated ID-list query param into a list, or null if absent. */
function parseIdListParam(searchParams: URLSearchParams, key: string): string[] | null {
  const raw = searchParams.get(key);
  if (!raw) return null;
  const ids = raw.split(",").filter(Boolean);
  return ids.length > 0 ? ids : null;
}

/**
 * Client-side counterpart to parseIdListParam: derives a stable SWR
 * cache-key fragment and a `&key=...` query-string suffix from an optional
 * ID list. `cacheTag` disambiguates cache keys across different filters
 * that might otherwise produce the same joined-ID string.
 */
function idListQueryParts(
  ids: string[] | undefined,
  key: string,
  cacheTag: string
): { cacheKey: string | null; querySuffix: string } {
  if (!ids || ids.length === 0) return { cacheKey: null, querySuffix: "" };
  const joined = ids.join(",");
  return { cacheKey: `${cacheTag}:${joined}`, querySuffix: `&${key}=${joined}` };
}

/** Parse a comma-separated `personIds` query param into a list, or null if absent. */
export function parsePersonIds(searchParams: URLSearchParams): string[] | null {
  return parseIdListParam(searchParams, "personIds");
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
  return idListQueryParts(personIds, "personIds", "p");
}

/** Parse a comma-separated `excludeReporterIds` query param into a list, or null if absent. */
export function parseExcludeReporterIds(searchParams: URLSearchParams): string[] | null {
  return parseIdListParam(searchParams, "excludeReporterIds");
}

/**
 * Prisma where-clause fragment for the "hide reporter team" filter on the
 * Daily view. A story/video is HIDDEN only when it has at least one
 * assignment in `role` AND every such assignee is in `excludeIds` — items
 * with no matching-role assignment at all, and items with at least one
 * non-excluded assignee in that role, always pass. Other roles never affect
 * the result either way. `role` defaults to "REPORTER" (the only case the
 * Daily view filter currently uses) but is parameterized so a future
 * same-shaped filter (e.g. hiding a team's editors) doesn't need a rewrite.
 * This is deliberately a separate helper from `personAssignmentFilter` — the
 * semantics are inverted (exclude-if-all-match vs. include-if-any-match),
 * not a variant of it.
 */
export function reporterTeamExclusionFilter(excludeIds: string[] | null, role: string = "REPORTER") {
  return excludeIds
    ? {
        OR: [
          { assignments: { none: { role } } },
          { assignments: { some: { role, personId: { notIn: excludeIds } } } },
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
  return idListQueryParts(excludeIds, "excludeReporterIds", "ex");
}

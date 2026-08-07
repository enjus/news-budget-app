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

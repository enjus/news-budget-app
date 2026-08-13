/**
 * Shared logic for the Daily view's "hide reporter team" filter. Used by both
 * DailyBudgetView (to derive the excluded person IDs sent to the API) and
 * TeamFilterControl (to render checkbox/badge state) so the two definitions
 * of "which hidden teams still exist" can't drift apart.
 */

interface TeamMemberLike {
  personId: string;
}

interface TeamLike {
  id: string;
  members: TeamMemberLike[];
}

/**
 * Given the raw excluded-team-IDs preference and the current team list,
 * drops any IDs for teams that no longer exist (e.g. deleted since the
 * preference was saved) and resolves the survivors to their member person
 * IDs, deduped across teams.
 */
export function resolveExcludedReporterTeams<T extends TeamLike>(
  excludedTeamIds: string[],
  teams: T[]
): { validTeamIds: string[]; personIds: string[] } {
  const validTeamIds = excludedTeamIds.filter((id) => teams.some((t) => t.id === id));
  const personIds = new Set<string>();
  for (const team of teams) {
    if (!validTeamIds.includes(team.id)) continue;
    for (const member of team.members) personIds.add(member.personId);
  }
  return { validTeamIds, personIds: [...personIds] };
}

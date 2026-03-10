import useSWR from "swr"
import type { TeamContentResponse } from "@/app/api/teams/[id]/content/route"

export function useTeamContent(teamId: string | null) {
  const { data, isLoading, error, mutate } = useSWR<TeamContentResponse>(
    teamId ? `/api/teams/${teamId}/content` : null,
    { refreshInterval: 30_000 }
  )

  return {
    team: data?.team ?? null,
    memberContent: data?.memberContent ?? [],
    isLoading,
    error,
    mutate,
  }
}

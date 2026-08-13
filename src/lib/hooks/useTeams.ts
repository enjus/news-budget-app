import useSWR from "swr"
import type { TeamWithMembers } from "@/types/index"

interface MyTeam extends TeamWithMembers {
  myRole: string
}

export function useMyTeams() {
  const { data, isLoading, error, mutate } = useSWR<{ teams: MyTeam[] }>("/api/teams/my")

  return {
    teams: data?.teams ?? [],
    isLoading,
    error,
    mutate,
  }
}

/** All teams org-wide, available to any authenticated user — used by the Daily view's reporter-team filter. */
export function useTeams() {
  const { data, isLoading, error, mutate } = useSWR<{ teams: TeamWithMembers[] }>("/api/teams")

  return {
    teams: data?.teams ?? [],
    isLoading,
    error,
    mutate,
  }
}

interface AdminTeam extends TeamWithMembers {
  _count: { members: number }
}

export function useAdminTeams() {
  const { data, isLoading, error, mutate } = useSWR<{ teams: AdminTeam[] }>("/api/admin/teams")

  return {
    teams: data?.teams ?? [],
    isLoading,
    error,
    mutate,
  }
}

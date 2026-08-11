import useSWR from "swr"
import type { PersonWithCounts } from "@/types/index"

interface UsePeopleOptions {
  role?: string
  /** Exclude inactive people. Defaults to true — pickers should only offer active staff. */
  activeOnly?: boolean
}

export function usePeople(options?: UsePeopleOptions) {
  const { role, activeOnly = true } = options ?? {}

  const params = new URLSearchParams()
  if (role) params.set("role", role)
  if (activeOnly) params.set("activeOnly", "true")
  const qs = params.toString()
  const url = qs ? `/api/people?${qs}` : "/api/people"

  const { data, isLoading, error, mutate } = useSWR<PersonWithCounts[]>(url)

  return {
    people: data ?? [],
    isLoading,
    error,
    mutate,
  }
}

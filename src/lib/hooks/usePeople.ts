import useSWR from "swr"
import type { PersonWithCounts } from "@/types/index"

export function usePeople(role?: string) {
  const url = role ? `/api/people?role=${encodeURIComponent(role)}` : "/api/people"

  const { data, isLoading, error, mutate } = useSWR<PersonWithCounts[]>(url)

  return {
    people: data ?? [],
    isLoading,
    error,
    mutate,
  }
}

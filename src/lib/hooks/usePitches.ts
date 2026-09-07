import useSWR from "swr"
import type { PitchListItem } from "@/types/index"

/** The shared Pitches pool. Polled — this is a multi-user surface. */
export function usePitches() {
  const { data, isLoading, error, mutate } = useSWR<PitchListItem[]>(
    "/api/budget/pitches",
    { refreshInterval: 30_000 }
  )

  return {
    pitches: data ?? [],
    isLoading,
    error,
    mutate,
  }
}

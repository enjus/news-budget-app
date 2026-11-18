import useSWR from "swr"
import type { VisualRequestList } from "@/types/index"
import { requestFiltersToQuery, type RequestFilters } from "@/lib/visual-request-list"

/** The /requests dashboard list for these filters. Polled: it's a shared queue, like Pitches. */
export function useVisualRequests(filters: RequestFilters) {
  const query = requestFiltersToQuery(filters)
  const { data, isLoading, error, mutate } = useSWR<VisualRequestList>(
    `/api/visuals${query ? `?${query}` : ""}`,
    { refreshInterval: 30_000, keepPreviousData: true }
  )

  return {
    requests: data?.requests ?? [],
    truncated: data?.truncated ?? false,
    isLoading,
    error,
    mutate,
  }
}

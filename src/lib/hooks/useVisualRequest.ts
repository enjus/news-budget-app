import useSWR from "swr"
import type { VisualRequestDetail } from "@/types/index"

/** One visual request, for its page. Polled: the desk and the requester work the same row. */
export function useVisualRequest(id: string | null) {
  const { data, isLoading, error, mutate } = useSWR<VisualRequestDetail>(
    id ? `/api/visuals/${id}` : null,
    { refreshInterval: 30_000 }
  )

  return {
    request: data,
    isLoading,
    // The shared fetcher throws "Request failed with status 404" for a missing row.
    notFound: error instanceof Error && error.message.endsWith(" 404"),
    error,
    mutate,
  }
}

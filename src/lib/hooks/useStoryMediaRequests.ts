import useSWR from "swr"
import type { MediaRequestListItem } from "@/types/index"

export function useStoryMediaRequests(storyId: string | null) {
  const { data, isLoading, error, mutate } = useSWR<MediaRequestListItem[]>(
    storyId ? `/api/stories/${storyId}/media-requests` : null,
    { refreshInterval: 30_000 }
  )

  return {
    mediaRequests: data ?? [],
    isLoading,
    error,
    mutate,
  }
}

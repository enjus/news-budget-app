import useSWR from "swr"
import type { StoryListItem, VideoWithRelations } from "@/types/index"

interface DraftsData {
  stories: StoryListItem[]
  videos: VideoWithRelations[]
}

export function useDrafts() {
  const { data, isLoading, error, mutate } = useSWR<DraftsData>("/api/drafts")

  return {
    stories: data?.stories ?? [],
    videos: data?.videos ?? [],
    isLoading,
    error,
    mutate,
  }
}

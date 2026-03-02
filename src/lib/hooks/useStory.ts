import useSWR from "swr"
import type { StoryWithRelations } from "@/types/index"

export function useStory(id: string | null) {
  const { data, isLoading, error, mutate } = useSWR<StoryWithRelations>(
    id ? `/api/stories/${id}` : null
  )

  return {
    story: data,
    isLoading,
    error,
    mutate,
  }
}

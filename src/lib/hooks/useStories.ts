import useSWR from "swr"
import type { StoryListRelations } from "@/types/index"

interface UseStoriesParams {
  status?: string
  enterprise?: boolean
  date?: string
}

export function useStories(params?: UseStoriesParams) {
  const searchParams = new URLSearchParams()

  if (params?.status) searchParams.set("status", params.status)
  if (params?.enterprise !== undefined) searchParams.set("enterprise", String(params.enterprise))
  if (params?.date) searchParams.set("date", params.date)

  const query = searchParams.toString()
  const url = `/api/stories${query ? `?${query}` : ""}`

  const { data, isLoading, error, mutate } = useSWR<StoryListRelations[]>(url)

  return {
    stories: data ?? [],
    isLoading,
    error,
    mutate,
  }
}

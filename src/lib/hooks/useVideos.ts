import useSWR from "swr"
import type { VideoWithRelations } from "@/types/index"

interface UseVideosParams {
  status?: string
  storyId?: string
  standalone?: boolean
  enterprise?: boolean
}

export function useVideos(params?: UseVideosParams) {
  const searchParams = new URLSearchParams()

  if (params?.status) searchParams.set("status", params.status)
  if (params?.storyId) searchParams.set("storyId", params.storyId)
  if (params?.standalone !== undefined) searchParams.set("standalone", String(params.standalone))
  if (params?.enterprise !== undefined) searchParams.set("enterprise", String(params.enterprise))

  const query = searchParams.toString()
  const url = `/api/videos${query ? `?${query}` : ""}`

  const { data, isLoading, error, mutate } = useSWR<VideoWithRelations[]>(url)

  return {
    videos: data ?? [],
    isLoading,
    error,
    mutate,
  }
}

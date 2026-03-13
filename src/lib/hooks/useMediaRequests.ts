import useSWR from "swr"
import type { MediaRequestListItem } from "@/types/index"

interface UseMediaRequestsParams {
  type?: string
  status?: string
  assigneeId?: string
  requestedById?: string
  storyId?: string
  archived?: boolean
}

export function useMediaRequests(params?: UseMediaRequestsParams) {
  const searchParams = new URLSearchParams()

  if (params?.type) searchParams.set("type", params.type)
  if (params?.status) searchParams.set("status", params.status)
  if (params?.assigneeId) searchParams.set("assigneeId", params.assigneeId)
  if (params?.requestedById) searchParams.set("requestedById", params.requestedById)
  if (params?.storyId) searchParams.set("storyId", params.storyId)
  if (params?.archived) searchParams.set("archived", "true")

  const query = searchParams.toString()
  const url = `/api/media-requests${query ? `?${query}` : ""}`

  const { data, isLoading, error, mutate } = useSWR<MediaRequestListItem[]>(url, {
    refreshInterval: 30_000,
  })

  return {
    mediaRequests: data ?? [],
    isLoading,
    error,
    mutate,
  }
}

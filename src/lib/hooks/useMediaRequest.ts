import useSWR from "swr"
import type { MediaRequestWithRelations } from "@/types/index"

export function useMediaRequest(id: string | null) {
  const { data, isLoading, error, mutate } = useSWR<MediaRequestWithRelations>(
    id ? `/api/media-requests/${id}` : null
  )

  return {
    mediaRequest: data,
    isLoading,
    error,
    mutate,
  }
}

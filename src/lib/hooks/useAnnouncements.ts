import { useMemo } from "react"
import useSWR from "swr"

export interface AnnouncementRecord {
  id: string
  title: string
  body: string | null
  url: string | null
  /** Last day shown, "YYYY-MM-DD" (newsroom date); null = until deleted. */
  endDate: string | null
  createdAt: string
}

export interface AnnouncementsResponse {
  announcements: AnnouncementRecord[]
}

/** Current (unexpired) homepage announcements, newest first. Empty while loading. */
export function useAnnouncements() {
  const { data, isLoading, error, mutate } = useSWR<AnnouncementsResponse>("/api/announcements")
  const announcements = useMemo(() => data?.announcements ?? [], [data])
  return { announcements, hasData: !!data, isLoading, error, mutate }
}

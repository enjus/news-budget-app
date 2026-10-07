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
  /** Admins only (empty for everyone else): ended within the past 3 days. */
  recentlyEnded: AnnouncementRecord[]
}

/**
 * Current (unexpired) homepage announcements, newest first, plus — for
 * admins — recently ended ones. Both lists are empty while loading; check
 * `isLoading`/`hasData` before treating empty as "none".
 */
export function useAnnouncements() {
  const { data, isLoading, error, mutate } = useSWR<AnnouncementsResponse>("/api/announcements")
  const announcements = useMemo(() => data?.announcements ?? [], [data])
  const recentlyEnded = useMemo(() => data?.recentlyEnded ?? [], [data])
  return { announcements, recentlyEnded, hasData: !!data, isLoading, error, mutate }
}

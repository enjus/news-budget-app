import useSWR from "swr"
import type { CalendarMarker } from "@prisma/client"

interface UseCalendarMarkersOptions {
  start: string // YYYY-MM-DD
  end: string // YYYY-MM-DD
  kind?: string
}

/** Holidays, the blackout, and calendar notes covering a window
 *  (GET /api/schedule/markers). Read-open, no auth required. */
export function useCalendarMarkers({ start, end, kind }: UseCalendarMarkersOptions) {
  const params = new URLSearchParams({ start, end })
  if (kind) params.set("kind", kind)

  const { data, isLoading, error, mutate } = useSWR<CalendarMarker[]>(
    `/api/schedule/markers?${params.toString()}`
  )

  return {
    markers: data ?? [],
    isLoading,
    error,
    mutate,
  }
}

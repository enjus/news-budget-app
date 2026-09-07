import useSWR from "swr"
import type { CalendarMarker } from "@prisma/client"
import type { ResolvedDay } from "@/lib/schedule"

export type WeekScheduleDay = ResolvedDay & {
  date: string
  note: string | null
  amNote?: string | null
  pmNote?: string | null
  inBlackout: boolean
}

export interface WeekSchedulePerson {
  id: string
  name: string
  teamIds: string[]
  days: WeekScheduleDay[]
}

interface WeekScheduleResponse {
  start: string
  end: string
  teams: { id: string; name: string }[]
  people: WeekSchedulePerson[]
  markers: CalendarMarker[]
}

/** Resolved roster status for a Monday-Sunday week (GET /api/schedule/week),
 *  for /schedule/teams. Roster-wide, read-open — no session dependency. */
export function useWeekSchedule(start: string) {
  const { data, isLoading, error, mutate } = useSWR<WeekScheduleResponse>(`/api/schedule/week?start=${start}`)

  return {
    start: data?.start ?? start,
    end: data?.end,
    teams: data?.teams ?? [],
    people: data?.people ?? [],
    markers: data?.markers ?? [],
    isLoading,
    error,
    mutate,
  }
}

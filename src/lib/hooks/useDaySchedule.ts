import useSWR from "swr"
import type { CalendarMarker } from "@prisma/client"
import type { ResolvedDay } from "@/lib/schedule"

export interface DaySchedulePerson {
  id: string
  name: string
  teamIds: string[]
  resolved: ResolvedDay
  note: string | null
  amNote?: string | null
  pmNote?: string | null
}

interface DayScheduleResponse {
  date: string
  people: DaySchedulePerson[]
  teams: { id: string; name: string }[]
  markers: CalendarMarker[]
}

/** Resolved roster status for one date (GET /api/schedule/day), for
 *  /schedule/today. Roster-wide, read-open — no session dependency, unlike
 *  useMySchedule(). */
export function useDaySchedule(date: string) {
  const { data, isLoading, error, mutate } = useSWR<DayScheduleResponse>(`/api/schedule/day?date=${date}`)

  return {
    people: data?.people ?? [],
    teams: data?.teams ?? [],
    markers: data?.markers ?? [],
    isLoading,
    error,
    mutate,
  }
}

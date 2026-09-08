import useSWR from "swr"
import type { ShiftConflictInfo } from "@/lib/schedule"

export type { ShiftConflictInfo }

export interface ShiftRoleAssignment {
  id: string
  personId: string
  name: string
  note: string | null
  conflict: ShiftConflictInfo | null
}

export interface ShiftDay {
  date: string
  holiday: { id: string; label: string } | null
  /** true when this date has no weekend/holiday basis — an ad-hoc coverage
   *  day (e.g. a weeknight protest) that exists only because it has an
   *  assignment. */
  adHoc: boolean
  roles: Record<string, ShiftRoleAssignment[]>
}

export interface ShiftRosterPerson {
  id: string
  name: string
}

interface ShiftsResponse {
  start: string
  end: string
  roster: ShiftRosterPerson[]
  days: ShiftDay[]
}

/** Shift days (weekends + observed holidays) over an arbitrary window
 *  (GET /api/schedule/shifts), for /schedule/shifts. Roster-wide, read-open —
 *  no session dependency. */
export function useShifts(start: string, end: string) {
  const { data, isLoading, error, mutate } = useSWR<ShiftsResponse>(`/api/schedule/shifts?start=${start}&end=${end}`)

  return {
    start: data?.start ?? start,
    end: data?.end ?? end,
    roster: data?.roster ?? [],
    days: data?.days ?? [],
    isLoading,
    error,
    mutate,
  }
}

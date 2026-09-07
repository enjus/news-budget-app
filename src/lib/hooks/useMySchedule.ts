import useSWR from "swr"
import { useSession } from "next-auth/react"
import type { CalendarMarker } from "@prisma/client"
import type { ResolvedDay } from "@/lib/schedule"

export type MyScheduleDay = ResolvedDay & {
  date: string /* YYYY-MM-DD */
  note: string | null
  amNote?: string | null
  pmNote?: string | null
}

interface MyScheduleResponse {
  days: MyScheduleDay[]
  markers: CalendarMarker[]
}

/**
 * The current user's own resolved schedule over a window
 * (GET /api/people/[id]/availability), driven by session.user.personId.
 * Short-circuits — no fetch, empty result — when the account has no linked
 * Person, which is a normal state (not an error) worth surfacing in the UI
 * as "ask an admin to link your account," not as a failed request.
 */
export function useMySchedule(start: string, end: string) {
  const { data: session, status: sessionStatus } = useSession()
  const personId = session?.user?.personId
  const sessionLoading = sessionStatus === "loading"

  const { data, isLoading, error, mutate } = useSWR<MyScheduleResponse>(
    personId ? `/api/people/${personId}/availability?start=${start}&end=${end}` : null
  )

  return {
    personId,
    days: data?.days ?? [],
    markers: data?.markers ?? [],
    // While the session itself is still resolving, `personId` reads as
    // undefined even for a properly-linked account — report loading rather
    // than falling through to "no personId" and flashing the empty state.
    isLoading: sessionLoading || (personId ? isLoading : false),
    error,
    mutate,
  }
}

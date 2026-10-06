"use client"

import { useState } from "react"
import { useShifts } from "@/lib/hooks/useShifts"
import { addDays } from "@/lib/utils"
import { clampToScheduleStart, scheduleToday } from "@/lib/schedule"
import { ShiftsView } from "./ShiftsView"

/** Owns the date-range state and the SWR fetch; ShiftsView is a pure render —
 *  follows the page -> Wrapper -> View convention (issue #19 §5). Default
 *  window is today through +56 days (8 weeks), editable to whatever range
 *  the season being keyed in actually needs. */
export function ShiftsWrapper() {
  // Issue #85: nothing before the cutover is tracked, so until then the
  // default window opens at the cutover rather than today.
  const [start, setStart] = useState(scheduleToday)
  const [end, setEnd] = useState(() => addDays(scheduleToday(), 56))
  const { roster, days, isLoading, mutate } = useShifts(start, end)

  return (
    <ShiftsView
      start={start}
      end={end}
      onRangeChange={(s, e) => { setStart(clampToScheduleStart(s)); setEnd(e) }}
      roster={roster}
      days={days}
      isLoading={isLoading}
      onSaved={() => mutate()}
    />
  )
}

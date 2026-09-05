"use client"

import { useState } from "react"
import { useShifts } from "@/lib/hooks/useShifts"
import { toDateString, dateOnly, todayString } from "@/lib/utils"
import { ShiftsView } from "./ShiftsView"

function addDays(dateStr: string, days: number): string {
  return toDateString(new Date(dateOnly(dateStr).getTime() + days * 24 * 60 * 60 * 1000))
}

/** Owns the date-range state and the SWR fetch; ShiftsView is a pure render —
 *  follows the page -> Wrapper -> View convention (issue #19 §5). Default
 *  window is today through +56 days (8 weeks), editable to whatever range
 *  the season being keyed in actually needs. */
export function ShiftsWrapper() {
  const [start, setStart] = useState(() => todayString())
  const [end, setEnd] = useState(() => addDays(todayString(), 56))
  const { roster, days, isLoading, mutate } = useShifts(start, end)

  return (
    <ShiftsView
      start={start}
      end={end}
      onRangeChange={(s, e) => { setStart(s); setEnd(e) }}
      roster={roster}
      days={days}
      isLoading={isLoading}
      onSaved={() => mutate()}
    />
  )
}

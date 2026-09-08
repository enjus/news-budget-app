"use client"

import { useState } from "react"
import { useWeekSchedule } from "@/lib/hooks/useWeekSchedule"
import { todayString, mondayOf } from "@/lib/utils"
import { TeamsView } from "./TeamsView"

/** Owns week-navigation state and the SWR fetch; TeamsView is a pure render
 *  — follows the page -> Wrapper -> View convention (issue #19 §5). */
export function TeamsWrapper() {
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayString()))
  const { people, teams, markers, isLoading, mutate } = useWeekSchedule(weekStart)

  return (
    <TeamsView
      weekStart={weekStart}
      onWeekStartChange={setWeekStart}
      people={people}
      teams={teams}
      markers={markers}
      isLoading={isLoading}
      onSaved={() => mutate()}
    />
  )
}

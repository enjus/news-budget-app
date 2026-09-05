"use client"

import { useState } from "react"
import { useDaySchedule } from "@/lib/hooks/useDaySchedule"
import { todayString } from "@/lib/utils"
import { TodayView } from "./TodayView"

/** Owns date-navigation state and the SWR fetch; TodayView is a pure render
 *  — follows the page -> Wrapper -> View convention (issue #19 §5). */
export function TodayWrapper() {
  const [date, setDate] = useState(todayString())
  const { people, teams, markers, isLoading } = useDaySchedule(date)

  return (
    <TodayView
      date={date}
      onDateChange={setDate}
      people={people}
      teams={teams}
      markers={markers}
      isLoading={isLoading}
    />
  )
}

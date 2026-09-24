"use client"

import { useState } from "react"
import { useSWRConfig } from "swr"
import { useWeekSchedule } from "@/lib/hooks/useWeekSchedule"
import { todayString } from "@/lib/utils"
import { TeamsView, visibleRange, type TeamsViewMode } from "./TeamsView"

/** Owns navigation state (view mode + anchor date) and the SWR fetch;
 *  TeamsView is a pure render — follows the page -> Wrapper -> View
 *  convention (issue #19 §5). The view mode lives here, not in the view,
 *  because Month changes what gets fetched. */
export function TeamsWrapper() {
  const [viewMode, setViewMode] = useState<TeamsViewMode>("week")
  const [anchor, setAnchor] = useState(() => todayString())
  const { start, end } = visibleRange(viewMode, anchor)
  // Week and Single day both read the Monday-Sunday week (no `end`), so the
  // week endpoint keeps its original request shape for them.
  const { people, teams, markers, isLoading } = useWeekSchedule(start, viewMode === "month" ? end : undefined)
  // Month and Week live under different SWR keys, so a save must refresh
  // every cached /api/schedule/week window — not just the one on screen —
  // or switching views right after an edit would show stale data.
  const { mutate } = useSWRConfig()

  return (
    <TeamsView
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      anchor={anchor}
      onAnchorChange={setAnchor}
      people={people}
      teams={teams}
      markers={markers}
      isLoading={isLoading}
      onSaved={() => mutate((key) => typeof key === "string" && key.startsWith("/api/schedule/week"))}
    />
  )
}

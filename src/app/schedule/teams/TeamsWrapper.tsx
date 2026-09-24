"use client"

import { useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useSession } from "next-auth/react"
import { useSWRConfig } from "swr"
import { useWeekSchedule } from "@/lib/hooks/useWeekSchedule"
import { todayString } from "@/lib/utils"
import { TeamsView, visibleRange, type TeamsViewMode } from "./TeamsView"

/** Owns navigation state (view mode + anchor date + team scope) and the SWR
 *  fetch; TeamsView is a pure render — follows the page -> Wrapper -> View
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

  // Team scope lives in the URL (?scope=mine|all|<teamId>) so a link like
  // "Newsroom next Tuesday" is shareable. It's a convenience filter over the
  // roster-wide payload, not an access boundary — everyone can pick any scope.
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { data: session } = useSession()

  // "My teams" comes from the roster payload itself (the viewer's linked
  // Person's teamIds), not /api/teams/my — that endpoint returns every team
  // for admins, which would make "My teams" silently equal "Newsroom".
  const personId = session?.user?.personId
  const myTeamIds = people.find((p) => p.id === personId)?.teamIds ?? []

  // No usable ?scope= (absent, or a team that no longer exists) falls back to
  // My teams when the viewer has any, otherwise Newsroom — so nobody lands on
  // an empty grid.
  const rawScope = searchParams.get("scope")
  const validRaw = rawScope === "all" || rawScope === "mine" || teams.some((t) => t.id === rawScope)
  let scope = validRaw && rawScope ? rawScope : myTeamIds.length > 0 ? "mine" : "all"
  if (scope === "mine" && myTeamIds.length === 0) scope = "all"

  function handleScopeChange(next: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("scope", next)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  return (
    <TeamsView
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      anchor={anchor}
      onAnchorChange={setAnchor}
      scope={scope}
      onScopeChange={handleScopeChange}
      myTeamIds={myTeamIds}
      people={people}
      teams={teams}
      markers={markers}
      isLoading={isLoading}
      onSaved={() => mutate((key) => typeof key === "string" && key.startsWith("/api/schedule/week"))}
    />
  )
}

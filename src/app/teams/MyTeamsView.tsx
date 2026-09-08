"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronDown, ChevronRight, Users, LayoutGrid, List } from "lucide-react"
import { CollapsibleSection } from "@/components/CollapsibleSection"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useMyTeams } from "@/lib/hooks/useTeams"
import { useTeamContent } from "@/lib/hooks/useTeamContent"
import { usePreferences, type TeamsView } from "@/lib/hooks/usePreferences"
import { PERSON_ROLE_LABELS, STORY_STATUS_LABELS, TEAM_MEMBER_ROLE_LABELS, cn, displayName, todayString, classifyContentItems } from "@/lib/utils"
import type { PersonContentItem } from "@/app/api/people/[id]/content/route"
import { ContentRow } from "@/components/budget/ContentItemRow"
import { VIDEOS_ENABLED } from "@/lib/features"
import { TeamScheduleView } from "@/app/teams/TeamScheduleView"

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Unpublished" },
  { value: "PUBLISHED_ITERATING", label: STORY_STATUS_LABELS["PUBLISHED_ITERATING"] },
  { value: "PUBLISHED_FINAL", label: STORY_STATUS_LABELS["PUBLISHED_FINAL"] },
]

export function MyTeamsView() {
  const { teams, isLoading: teamsLoading } = useMyTeams()
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const { preferences, setPreferences } = usePreferences()

  // Auto-select first team once loaded
  const activeTeamId = selectedTeamId ?? teams[0]?.id ?? null
  const activeTeam = teams.find((t) => t.id === activeTeamId) ?? null

  if (teamsLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-64" />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (teams.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-xl font-semibold mb-4">My Teams</h1>
        <div className="rounded-lg border bg-card p-12 text-center">
          <Users className="mx-auto size-8 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">
            You are not on any teams yet. Ask an admin to add you to a team.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">My Teams</h1>
      </div>

      {/* Team selector (if multiple) */}
      {teams.length > 1 && (
        <div className="flex items-center gap-2">
          {teams.map((team) => (
            <button
              key={team.id}
              onClick={() => setSelectedTeamId(team.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTeamId === team.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80 text-muted-foreground"
              }`}
            >
              {team.name}
            </button>
          ))}
        </div>
      )}

      {/* View tabs */}
      <div className="flex divide-x overflow-hidden rounded-md border w-fit">
        <Button
          size="sm"
          variant="ghost"
          className={cn("rounded-none gap-1.5 text-xs", preferences.teamsView === "columns" && "bg-muted font-medium")}
          onClick={() => setPreferences({ teamsView: "columns" as TeamsView })}
        >
          <LayoutGrid className="size-3.5" />
          Columns
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className={cn("rounded-none gap-1.5 text-xs", preferences.teamsView === "agenda" && "bg-muted font-medium")}
          onClick={() => setPreferences({ teamsView: "agenda" as TeamsView })}
        >
          <List className="size-3.5" />
          Agenda
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className={cn("rounded-none gap-1.5 text-xs", preferences.teamsView === "members" && "bg-muted font-medium")}
          onClick={() => setPreferences({ teamsView: "members" as TeamsView })}
        >
          <Users className="size-3.5" />
          Members
        </Button>
      </div>

      {activeTeam && preferences.teamsView === "columns" && (
        <TeamScheduleView team={activeTeam} mode="columns" />
      )}
      {activeTeam && preferences.teamsView === "agenda" && (
        <TeamScheduleView team={activeTeam} mode="agenda" />
      )}
      {activeTeamId && preferences.teamsView === "members" && (
        <TeamMembersView teamId={activeTeamId} />
      )}
    </div>
  )
}

function TeamMembersView({ teamId }: { teamId: string }) {
  const { team, memberContent, isLoading } = useTeamContent(teamId)
  const [typeFilter, setTypeFilter] = useState<"all" | "story" | "video">("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  // Members start collapsed by default; expanded state persists client-side
  // (localStorage via usePreferences) across sessions.
  const { preferences, setPreferences } = usePreferences()
  const expandedMembers = preferences.expandedTeamMemberIds
  // Past and TBD sections start collapsed per member; Upcoming stays expanded.
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
          </div>
        ))}
      </div>
    )
  }

  if (!team) return null

  // Matches the Pacific-time boundary /api/teams/[id]/content uses to split
  // upcoming (unbounded) from past (capped), so client display and server
  // fetching agree on what "today" means.
  const today = todayString()

  function toggleMember(personId: string) {
    const key = `${teamId}:${personId}`
    setPreferences((prev) => ({
      expandedTeamMemberIds: prev.expandedTeamMemberIds.includes(key)
        ? prev.expandedTeamMemberIds.filter((id) => id !== key)
        : [...prev.expandedTeamMemberIds, key],
    }))
  }

  function toggleSection(key: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Filter and categorize items per member
  const filteredMembers = memberContent.map((mc) => {
    const filtered = mc.items.filter((item) => {
      if (!VIDEOS_ENABLED && item.type === "video") return false
      if (typeFilter !== "all" && item.type !== typeFilter) return false
      if (statusFilter !== "all" && item.status !== statusFilter) return false
      return true
    })

    const { tbd: tbdItems, upcoming: upcomingItems, past: pastItems } = classifyContentItems(filtered, today)

    return { ...mc, filtered, tbdItems, upcomingItems, pastItems }
  })

  const totalItems = filteredMembers.reduce((sum, mc) => sum + mc.filtered.length, 0)
  const hasActiveFilters = typeFilter !== "all" || statusFilter !== "all"

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border text-sm overflow-hidden">
          {(["all", "story", ...(VIDEOS_ENABLED ? ["video"] : [])] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t as "all" | "story" | "video")}
              className={`px-3 py-1.5 capitalize transition-colors ${
                typeFilter === t
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              {t === "all" ? "All" : t === "story" ? "Stories" : "Videos"}
            </button>
          ))}
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-[160px] text-sm">
            <SelectValue placeholder="Any status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              setTypeFilter("all")
              setStatusFilter("all")
            }}
          >
            Clear
          </Button>
        )}

        <span className="text-xs text-muted-foreground ml-auto">
          {totalItems} {totalItems === 1 ? "item" : "items"}
        </span>
      </div>

      {/* Members and their content */}
      <div className="space-y-4">
        {filteredMembers.map((mc) => {
          const isCollapsed = !expandedMembers.includes(`${teamId}:${mc.person.id}`)
          const Chevron = isCollapsed ? ChevronRight : ChevronDown
          const tbdKey = `${mc.person.id}:tbd`
          const pastKey = `${mc.person.id}:past`

          return (
            <div key={mc.person.id} className="rounded-lg border bg-card">
              {/* Member header */}
              <button
                onClick={() => toggleMember(mc.person.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
              >
                <Chevron className="size-3.5 shrink-0 text-muted-foreground" />
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Link
                    href={`/people/${mc.person.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="font-medium text-sm hover:underline"
                  >
                    {displayName(mc.person.name)}
                  </Link>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {TEAM_MEMBER_ROLE_LABELS[mc.teamRole] ?? mc.teamRole}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {PERSON_ROLE_LABELS[mc.person.defaultRole] ?? mc.person.defaultRole}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {mc.filtered.length} {mc.filtered.length === 1 ? "item" : "items"}
                </span>
              </button>

              {/* Member content */}
              {!isCollapsed && (
                <div className="border-t px-4 py-3 space-y-3">
                  {mc.filtered.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-2">No items</p>
                  ) : (
                    <>
                      {mc.upcomingItems.length > 0 && (
                        <ContentSection title="Upcoming" items={mc.upcomingItems} />
                      )}
                      {mc.tbdItems.length > 0 && (
                        <CollapsibleSection
                          title="TBD"
                          count={mc.tbdItems.length}
                          open={expandedSections.has(tbdKey)}
                          onToggle={() => toggleSection(tbdKey)}
                          compact
                        >
                          <div className="space-y-1">
                            {mc.tbdItems.map((item) => (
                              <ContentRow key={`${item.type}-${item.id}-${item.role}`} item={item} />
                            ))}
                          </div>
                        </CollapsibleSection>
                      )}
                      {mc.pastItems.length > 0 && (
                        <CollapsibleSection
                          title="Past"
                          count={mc.pastItems.length}
                          truncated={mc.pastTruncated}
                          open={expandedSections.has(pastKey)}
                          onToggle={() => toggleSection(pastKey)}
                          compact
                        >
                          <div className="space-y-1">
                            {mc.pastItems.map((item) => (
                              <ContentRow key={`${item.type}-${item.id}-${item.role}`} item={item} />
                            ))}
                          </div>
                        </CollapsibleSection>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ContentSection({ title, items }: { title: string; items: PersonContentItem[] }) {
  return (
    <div>
      <h4 className="text-xs font-medium text-muted-foreground mb-1">{title}</h4>
      <div className="space-y-1">
        {items.map((item) => (
          <ContentRow key={`${item.type}-${item.id}-${item.role}`} item={item} />
        ))}
      </div>
    </div>
  )
}

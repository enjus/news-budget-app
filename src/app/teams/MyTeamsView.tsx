"use client"

import { useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { format } from "date-fns"
import { FileText, Video, ChevronDown, ChevronRight, Users } from "lucide-react"
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
import { PERSON_ROLE_LABELS, STORY_STATUS_LABELS, TEAM_MEMBER_ROLE_LABELS } from "@/lib/utils"
import type { PersonContentItem } from "@/app/api/people/[id]/content/route"

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Unpublished" },
  { value: "PUBLISHED_ITERATING", label: STORY_STATUS_LABELS["PUBLISHED_ITERATING"] },
  { value: "PUBLISHED_FINAL", label: STORY_STATUS_LABELS["PUBLISHED_FINAL"] },
]

function formatItemDate(item: PersonContentItem): string {
  if (item.onlinePubDateTBD || !item.onlinePubDate) return "TBD"
  const d = new Date(item.onlinePubDate)
  const fakeLocal = new Date(
    d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(),
    d.getUTCHours(), d.getUTCMinutes()
  )
  return format(fakeLocal, "MMM d, yyyy · h:mm a")
}

function itemDateStr(item: PersonContentItem): string | null {
  if (item.onlinePubDateTBD || !item.onlinePubDate) return null
  const d = new Date(item.onlinePubDate)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
}

export function MyTeamsView() {
  const { teams, isLoading: teamsLoading } = useMyTeams()
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)

  // Auto-select first team once loaded
  const activeTeamId = selectedTeamId ?? teams[0]?.id ?? null

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

      {activeTeamId && <TeamContentView teamId={activeTeamId} />}
    </div>
  )
}

function TeamContentView({ teamId }: { teamId: string }) {
  const { team, memberContent, isLoading } = useTeamContent(teamId)
  const [typeFilter, setTypeFilter] = useState<"all" | "story" | "video">("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [collapsedMembers, setCollapsedMembers] = useState<Set<string>>(new Set())

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

  const today = format(new Date(), "yyyy-MM-dd")

  function toggleMember(personId: string) {
    setCollapsedMembers((prev) => {
      const next = new Set(prev)
      if (next.has(personId)) next.delete(personId)
      else next.add(personId)
      return next
    })
  }

  // Filter and categorize items per member
  const filteredMembers = memberContent.map((mc) => {
    const filtered = mc.items.filter((item) => {
      if (typeFilter !== "all" && item.type !== typeFilter) return false
      if (statusFilter !== "all" && item.status !== statusFilter) return false
      return true
    })

    const tbdItems = filtered.filter((item) => item.onlinePubDateTBD || !item.onlinePubDate)
    const upcomingItems = filtered.filter((item) => {
      const ds = itemDateStr(item)
      return ds !== null && ds >= today
    })
    const pastItems = filtered.filter((item) => {
      const ds = itemDateStr(item)
      return ds !== null && ds < today
    })

    return { ...mc, filtered, tbdItems, upcomingItems, pastItems }
  })

  const totalItems = filteredMembers.reduce((sum, mc) => sum + mc.filtered.length, 0)
  const hasActiveFilters = typeFilter !== "all" || statusFilter !== "all"

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border text-sm overflow-hidden">
          {(["all", "story", "video"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
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
          const isCollapsed = collapsedMembers.has(mc.person.id)
          const Chevron = isCollapsed ? ChevronRight : ChevronDown

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
                    {mc.person.name}
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
                      {mc.tbdItems.length > 0 && (
                        <ContentSection title="TBD" items={mc.tbdItems} />
                      )}
                      {mc.upcomingItems.length > 0 && (
                        <ContentSection title="Upcoming" items={mc.upcomingItems} />
                      )}
                      {mc.pastItems.length > 0 && (
                        <ContentSection title="Past" items={mc.pastItems.slice(0, 5)} />
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
          <ContentRow key={`${item.type}-${item.id}`} item={item} />
        ))}
      </div>
    </div>
  )
}

function ContentRow({ item }: { item: PersonContentItem }) {
  const href = item.type === "story" ? `/stories/${item.id}` : `/videos/${item.id}`
  const Icon = item.type === "story" ? FileText : Video

  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-md px-3 py-2 text-sm hover:bg-accent/50 transition-colors"
    >
      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{item.slug}</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {PERSON_ROLE_LABELS[item.role] ?? item.role}
          </Badge>
          {item.status === "DRAFT" ? (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
              Unpublished
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {STORY_STATUS_LABELS[item.status] ?? item.status}
            </Badge>
          )}
        </div>
        {item.budgetLine && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.budgetLine}</p>
        )}
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">
        {formatItemDate(item)}
      </span>
    </Link>
  )
}

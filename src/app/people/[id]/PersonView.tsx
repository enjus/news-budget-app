"use client"

import { useState } from "react"
import { apiPath } from "@/lib/api-path"
import { usePersonRosterActions } from "@/lib/hooks/usePersonRosterActions"
import Link from "next/link"
import useSWR from "swr"
import { useSession } from "next-auth/react"
import { ArrowLeft, UserCheck, UserX, Briefcase, TriangleAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CollapsibleSection, EmptySection } from "@/components/CollapsibleSection"
import { ContentRow } from "@/components/budget/ContentItemRow"
import {
  PERSON_ROLE_LABELS,
  STORY_STATUS_LABELS,
  hasAdminAccess,
  canManageRoster,
  displayName,
  todayString,
  itemDateStr,
  classifyContentItems,
} from "@/lib/utils"
import type { PersonContentItem } from "@/app/api/people/[id]/content/route"

const PAST_INITIAL_COUNT = 10

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Unpublished" },
  { value: "SCHEDULED", label: STORY_STATUS_LABELS["SCHEDULED"] },
  { value: "PUBLISHED_ITERATING", label: STORY_STATUS_LABELS["PUBLISHED_ITERATING"] },
  { value: "PUBLISHED_FINAL", label: STORY_STATUS_LABELS["PUBLISHED_FINAL"] },
  { value: "SHELVED", label: STORY_STATUS_LABELS["SHELVED"] },
]

interface PersonViewProps {
  id: string
}

interface PersonData {
  person: {
    id: string
    name: string
    email: string | null
    defaultRole: string
    isActive: boolean
    isStaff: boolean
    user: { id: string } | null
  }
  items: PersonContentItem[]
}

const fetcher = (url: string) => fetch(apiPath(url)).then((r) => r.json())

export function PersonView({ id }: PersonViewProps) {
  const { data: session } = useSession()
  const isAdmin = hasAdminAccess(session?.user?.appRole ?? "")
  const canManage = canManageRoster(session?.user?.appRole ?? "")
  const [typeFilter, setTypeFilter] = useState<"all" | "story" | "video">("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [openTbd, setOpenTbd] = useState(true)
  const [openUpcoming, setOpenUpcoming] = useState(true)
  const [openPast, setOpenPast] = useState(true)
  const [showAllPast, setShowAllPast] = useState(false)

  const { data, isLoading, error, mutate } = useSWR<PersonData>(
    `/api/people/${id}/content`,
    fetcher
  )
  const { togglingActive, togglingStaff, toggleActive, toggleStaff } = usePersonRosterActions(id, mutate)

  if (error || (data && !data.items)) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Failed to load person content.
      </div>
    )
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        <div className="mt-6 flex gap-6">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  const { person, items } = data
  const storyCount = items.filter((i) => i.type === "story").length
  const videoCount = items.filter((i) => i.type === "video").length

  const today = todayString()

  // Type and status filters apply globally
  const globalFiltered = items.filter((item) => {
    if (typeFilter !== "all" && item.type !== typeFilter) return false
    if (statusFilter !== "all" && item.status !== statusFilter) return false
    return true
  })

  const { tbd: tbdItems, upcoming: upcomingItems, past: pastItemsAll } = classifyContentItems(globalFiltered, today)
  // Date range filter applies only to past
  const pastItems = pastItemsAll.filter((item) => {
    const ds = itemDateStr(item)
    if (dateFrom && ds! < dateFrom) return false
    if (dateTo && ds! > dateTo) return false
    return true
  })

  const visiblePastItems = showAllPast
    ? pastItems
    : pastItems.slice(0, PAST_INITIAL_COUNT)

  const hasActiveFilters = typeFilter !== "all" || statusFilter !== "all" || dateFrom || dateTo

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link
        href="/people"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        People
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{displayName(person.name)}</h1>
            {!person.isActive && (
              <Badge variant="outline" className="text-muted-foreground">
                Inactive
              </Badge>
            )}
            {person.isStaff && (
              <Badge variant="secondary">Staff</Badge>
            )}
            {person.isStaff && person.isActive && !person.user && (
              <Badge variant="outline" className="gap-1 text-muted-foreground">
                <TriangleAlert className="size-3" />
                No linked account
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {person.email && (
              <>
                <span>{person.email}</span>
                <span>·</span>
              </>
            )}
            <span>{PERSON_ROLE_LABELS[person.defaultRole] ?? person.defaultRole}</span>
          </div>
        </div>

        <div className="flex gap-2">
          {canManage && (
            <Button
              variant="outline"
              size="sm"
              disabled={togglingStaff}
              onClick={() => toggleStaff(person.isStaff)}
            >
              <Briefcase className="size-4" />
              {person.isStaff ? "Remove from staff" : "Add to staff"}
            </Button>
          )}

          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              disabled={togglingActive}
              onClick={() => toggleActive(person.isActive)}
            >
              {person.isActive ? (
                <>
                  <UserX className="size-4" />
                  Mark inactive
                </>
              ) : (
                <>
                  <UserCheck className="size-4" />
                  Mark active
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-6 text-sm">
        <div>
          <span className="text-2xl font-semibold">{storyCount}</span>
          <span className="ml-1 text-muted-foreground">
            {storyCount === 1 ? "story" : "stories"}
          </span>
        </div>
        <div>
          <span className="text-2xl font-semibold">{videoCount}</span>
          <span className="ml-1 text-muted-foreground">
            {videoCount === 1 ? "video" : "videos"}
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Type toggle */}
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

        {/* Status filter */}
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

        {/* Date range — scoped to Past */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Past:</span>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-8 w-[140px] text-sm"
            aria-label="Past from date"
          />
          <span className="text-muted-foreground text-sm">–</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-8 w-[140px] text-sm"
            aria-label="Past to date"
          />
        </div>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              setTypeFilter("all")
              setStatusFilter("all")
              setDateFrom("")
              setDateTo("")
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {/* Sections */}
      <div className="space-y-4">
        <CollapsibleSection
          title="TBD"
          count={tbdItems.length}
          open={openTbd}
          onToggle={() => setOpenTbd((v) => !v)}
        >
          {tbdItems.length === 0 ? (
            <EmptySection />
          ) : (
            <div className="space-y-1">
              {tbdItems.map((item) => (
                <ContentRow key={`${item.type}-${item.id}-${item.role}`} item={item} />
              ))}
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection
          title="Upcoming"
          count={upcomingItems.length}
          open={openUpcoming}
          onToggle={() => setOpenUpcoming((v) => !v)}
        >
          {upcomingItems.length === 0 ? (
            <EmptySection />
          ) : (
            <div className="space-y-1">
              {upcomingItems.map((item) => (
                <ContentRow key={`${item.type}-${item.id}-${item.role}`} item={item} />
              ))}
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection
          title="Past"
          count={pastItems.length}
          open={openPast}
          onToggle={() => {
            setOpenPast((v) => !v)
            setShowAllPast(false)
          }}
        >
          {pastItems.length === 0 ? (
            <EmptySection />
          ) : (
            <div className="space-y-1">
              {visiblePastItems.map((item) => (
                <ContentRow key={`${item.type}-${item.id}-${item.role}`} item={item} />
              ))}
              {pastItems.length > PAST_INITIAL_COUNT && (
                <button
                  onClick={() => setShowAllPast((v) => !v)}
                  className="w-full pt-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showAllPast
                    ? "Show less"
                    : `Show ${pastItems.length - PAST_INITIAL_COUNT} more`}
                </button>
              )}
            </div>
          )}
        </CollapsibleSection>
      </div>
    </div>
  )
}

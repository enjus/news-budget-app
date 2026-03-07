"use client"

import { useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { format } from "date-fns"
import { ArrowLeft, FileText, Video, ChevronDown, ChevronRight } from "lucide-react"
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
import { PERSON_ROLE_LABELS, STORY_STATUS_LABELS } from "@/lib/utils"
import type { PersonContentItem } from "@/app/api/people/[id]/content/route"

const PAST_INITIAL_COUNT = 10

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Unpublished" },
  { value: "SCHEDULED", label: STORY_STATUS_LABELS["SCHEDULED"] },
  { value: "PUBLISHED_ITERATING", label: STORY_STATUS_LABELS["PUBLISHED_ITERATING"] },
  { value: "PUBLISHED_FINAL", label: STORY_STATUS_LABELS["PUBLISHED_FINAL"] },
]

interface PersonViewProps {
  id: string
}

interface PersonData {
  person: { id: string; name: string; email: string; defaultRole: string }
  items: PersonContentItem[]
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function itemDateStr(item: PersonContentItem): string | null {
  if (item.onlinePubDateTBD || !item.onlinePubDate) return null
  const d = new Date(item.onlinePubDate)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
}

function formatItemDate(item: PersonContentItem): string {
  if (item.onlinePubDateTBD || !item.onlinePubDate) return "TBD"
  const d = new Date(item.onlinePubDate)
  const fakeLocal = new Date(
    d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(),
    d.getUTCHours(), d.getUTCMinutes()
  )
  return format(fakeLocal, "MMM d, yyyy · h:mm a")
}

export function PersonView({ id }: PersonViewProps) {
  const [typeFilter, setTypeFilter] = useState<"all" | "story" | "video">("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [openTbd, setOpenTbd] = useState(true)
  const [openUpcoming, setOpenUpcoming] = useState(true)
  const [openPast, setOpenPast] = useState(true)
  const [showAllPast, setShowAllPast] = useState(false)

  const { data, isLoading } = useSWR<PersonData>(
    `/api/people/${id}/content`,
    fetcher
  )

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

  const today = format(new Date(), "yyyy-MM-dd")

  // Type and status filters apply globally
  const globalFiltered = items.filter((item) => {
    if (typeFilter !== "all" && item.type !== typeFilter) return false
    if (statusFilter !== "all" && item.status !== statusFilter) return false
    return true
  })

  const tbdItems = globalFiltered.filter((item) => item.onlinePubDateTBD || !item.onlinePubDate)
  const upcomingItems = globalFiltered.filter((item) => {
    const ds = itemDateStr(item)
    return ds !== null && ds >= today
  })
  // Date range filter applies only to past
  const pastItems = globalFiltered
    .filter((item) => {
      const ds = itemDateStr(item)
      if (ds === null || ds >= today) return false
      if (dateFrom && ds < dateFrom) return false
      if (dateTo && ds > dateTo) return false
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
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{person.name}</h1>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{person.email}</span>
          <span>·</span>
          <span>{PERSON_ROLE_LABELS[person.defaultRole] ?? person.defaultRole}</span>
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
        <Section
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
                <ContentRow key={`${item.type}-${item.id}`} item={item} />
              ))}
            </div>
          )}
        </Section>

        <Section
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
                <ContentRow key={`${item.type}-${item.id}`} item={item} />
              ))}
            </div>
          )}
        </Section>

        <Section
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
                <ContentRow key={`${item.type}-${item.id}`} item={item} />
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
        </Section>
      </div>
    </div>
  )
}

function Section({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string
  count: number
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  const Chevron = open ? ChevronDown : ChevronRight
  return (
    <div>
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-1.5 pb-2 text-sm font-medium hover:text-foreground text-foreground/80 transition-colors"
      >
        <Chevron className="size-3.5 shrink-0" />
        {title}
        <span className="text-muted-foreground font-normal">({count})</span>
      </button>
      {open && children}
    </div>
  )
}

function EmptySection() {
  return (
    <p className="py-4 text-center text-sm text-muted-foreground">None</p>
  )
}

function ContentRow({ item }: { item: PersonContentItem }) {
  const href = item.type === "story" ? `/stories/${item.id}` : `/videos/${item.id}`
  const Icon = item.type === "story" ? FileText : Video

  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-lg border bg-card px-4 py-3 text-sm hover:bg-accent/50 transition-colors"
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

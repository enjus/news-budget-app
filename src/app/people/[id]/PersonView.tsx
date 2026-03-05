"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import useSWR from "swr"
import { format } from "date-fns"
import { ArrowLeft, FileText, Video, ChevronLeft, ChevronRight } from "lucide-react"
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

const PAGE_SIZE = 25

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

function formatItemDate(item: PersonContentItem): string {
  if (item.onlinePubDateTBD || !item.onlinePubDate) return "TBD"
  const d = new Date(item.onlinePubDate)
  // Times stored as newsroom-time-as-UTC — read UTC parts for display
  const fakeLocal = new Date(
    d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(),
    d.getUTCHours(), d.getUTCMinutes()
  )
  return format(fakeLocal, "MMM d, yyyy · h:mm a")
}

export function PersonView({ id }: PersonViewProps) {
  const [page, setPage] = useState(0)
  const [typeFilter, setTypeFilter] = useState<"all" | "story" | "video">("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  const { data, isLoading } = useSWR<PersonData>(
    `/api/people/${id}/content`,
    fetcher
  )

  // Reset page when filters change
  useEffect(() => {
    setPage(0)
  }, [typeFilter, statusFilter, dateFrom, dateTo])

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

  // Apply filters
  const filtered = items.filter((item) => {
    if (typeFilter !== "all" && item.type !== typeFilter) return false
    if (statusFilter !== "all" && item.status !== statusFilter) return false
    if (dateFrom || dateTo) {
      if (item.onlinePubDateTBD || !item.onlinePubDate) {
        // TBD items only show when no date range filter is active
        if (dateFrom || dateTo) return false
      } else {
        const d = new Date(item.onlinePubDate)
        const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
        if (dateFrom && dateStr < dateFrom) return false
        if (dateTo && dateStr > dateTo) return false
      }
    }
    return true
  })

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

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

        {/* Date range */}
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-8 w-[140px] text-sm"
            placeholder="From"
            aria-label="From date"
          />
          <span className="text-muted-foreground text-sm">–</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-8 w-[140px] text-sm"
            placeholder="To"
            aria-label="To date"
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

      {/* Content list */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {hasActiveFilters ? "No items match the current filters." : "No content assigned to this person."}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-1">
            {pageItems.map((item, idx) => {
              const prevItem = idx > 0 ? pageItems[idx - 1] : filtered[page * PAGE_SIZE - 1]
              const showDivider =
                !item.onlinePubDateTBD &&
                (prevItem?.onlinePubDateTBD ?? false)

              return (
                <div key={`${item.type}-${item.id}`}>
                  {showDivider && (
                    <div className="my-3 flex items-center gap-3">
                      <div className="flex-1 border-t" />
                      <span className="text-xs text-muted-foreground">Scheduled</span>
                      <div className="flex-1 border-t" />
                    </div>
                  )}
                  <ContentRow item={item} />
                </div>
              )
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p - 1)}
                disabled={page === 0}
              >
                <ChevronLeft className="size-4" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages - 1}
              >
                Next
                <ChevronRight className="size-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
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

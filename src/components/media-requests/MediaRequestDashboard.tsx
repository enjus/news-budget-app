"use client"

import { useState } from "react"
import Link from "next/link"
import { Plus, Archive, ArchiveX } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useMediaRequests } from "@/lib/hooks/useMediaRequests"
import { MediaRequestCard } from "./MediaRequestCard"
import {
  MEDIA_REQUEST_TYPE_LABELS,
  MEDIA_REQUEST_STATUS_LABELS,
} from "@/lib/utils"

const TYPE_FILTERS = [
  { value: "all", label: "All Types" },
  ...Object.entries(MEDIA_REQUEST_TYPE_LABELS).map(([value, label]) => ({ value, label })),
]

const ACTIVE_STATUS_FILTERS = [
  { value: "all", label: "All Statuses" },
  ...["REQUESTED", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "DELIVERED"].map((v) => ({
    value: v,
    label: MEDIA_REQUEST_STATUS_LABELS[v],
  })),
]

const ARCHIVE_STATUS_FILTERS = [
  { value: "all", label: "All Statuses" },
  ...["COMPLETED", "DELIVERED", "DECLINED", "CANCELED"].map((v) => ({
    value: v,
    label: MEDIA_REQUEST_STATUS_LABELS[v],
  })),
]

const ACTIVE_SUMMARY = ["REQUESTED", "ASSIGNED", "IN_PROGRESS", "COMPLETED"]
const ARCHIVE_SUMMARY = ["COMPLETED", "DELIVERED", "DECLINED", "CANCELED"]

export function MediaRequestDashboard() {
  const [typeFilter, setTypeFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [showArchive, setShowArchive] = useState(false)

  const params: Record<string, string | boolean> = { archived: showArchive }
  if (typeFilter !== "all") params.type = typeFilter
  if (statusFilter !== "all") params.status = statusFilter

  const { mediaRequests, isLoading } = useMediaRequests(params as Parameters<typeof useMediaRequests>[0])

  // Status counts from current results
  const statusCounts: Record<string, number> = {}
  mediaRequests.forEach((mr) => {
    statusCounts[mr.status] = (statusCounts[mr.status] || 0) + 1
  })

  const summaryStatuses = showArchive ? ARCHIVE_SUMMARY : ACTIVE_SUMMARY
  const statusFilters = showArchive ? ARCHIVE_STATUS_FILTERS : ACTIVE_STATUS_FILTERS

  function handleToggleArchive() {
    setShowArchive((v) => !v)
    setStatusFilter("all")
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">
          {showArchive ? "Archived Requests" : "Media Requests"}
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleToggleArchive}>
            {showArchive ? (
              <><ArchiveX className="size-4" />Active</>
            ) : (
              <><Archive className="size-4" />Archive</>
            )}
          </Button>
          {!showArchive && (
            <Button asChild size="sm">
              <Link href="/media-requests/new">
                <Plus className="size-4" />
                New Request
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Status summary */}
      <div className="flex flex-wrap gap-4 text-sm">
        {summaryStatuses.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
            className={`font-medium transition-colors ${
              statusFilter === s ? "text-primary underline underline-offset-4" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {MEDIA_REQUEST_STATUS_LABELS[s]}{" "}
            <span className="text-xs">({statusCounts[s] || 0})</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-8 w-[160px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPE_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-[160px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusFilters.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(typeFilter !== "all" || statusFilter !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => { setTypeFilter("all"); setStatusFilter("all") }}
          >
            Clear
          </Button>
        )}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : mediaRequests.length > 0 ? (
        <div className="space-y-2">
          {mediaRequests.map((mr) => (
            <MediaRequestCard key={mr.id} request={mr} />
          ))}
        </div>
      ) : (
        <div className="py-12 text-center text-sm text-muted-foreground">
          {showArchive ? "No archived requests." : "No media requests found."}
        </div>
      )}
    </div>
  )
}

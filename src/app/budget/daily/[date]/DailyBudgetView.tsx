"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { format, parseISO, addDays, subDays } from "date-fns"
import {
  ChevronLeft, ChevronRight, Plus,
  FileText, Video, LayoutGrid, List, CheckSquare,
} from "lucide-react"

import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { ColumnsView } from "@/components/budget/ColumnsView"
import { AgendaView } from "@/components/budget/AgendaView"
import { DndProvider } from "@/components/dnd/DndProvider"
import { SortableCard } from "@/components/dnd/SortableCard"
import { StoryCard } from "@/components/budget/StoryCard"
import { VideoCard } from "@/components/budget/VideoCard"
import { TIME_BUCKETS, dateToBucket, todayString, cn, STORY_STATUS_LABELS, INDICATOR_OPTIONS } from "@/lib/utils"
import { usePreferences } from "@/lib/hooks/usePreferences"
import { apiPath } from "@/lib/api-path"
import { VIDEOS_ENABLED } from "@/lib/features"

// ─── Types ────────────────────────────────────────────────────────────────────

interface DailyBudgetViewProps {
  date: string // YYYY-MM-DD
}

// ─── Main View ────────────────────────────────────────────────────────────────

export function DailyBudgetView({ date }: DailyBudgetViewProps) {
  const { preferences, setPreferences } = usePreferences()
  const [showStories, setShowStories] = useState(() => preferences.contentDefault !== "videos")
  const [showVideos, setShowVideos]   = useState(() => VIDEOS_ENABLED && preferences.contentDefault !== "stories")
  const [viewMode, setViewMode] = useState<"columns" | "agenda">(() =>
    preferences.defaultView === "daily-agenda" ? "agenda" : "columns"
  )

  // Bulk select state
  const [selectMode, setSelectMode] = useState(false)
  const [selectedItems, setSelectedItems] = useState<Map<string, string>>(new Map()) // compositeId → originalStatus
  const [bulkStatus, setBulkStatus] = useState("")
  const [bulkIndicator, setBulkIndicator] = useState("")
  const [applying, setApplying] = useState(false)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  // Mobile always uses agenda regardless of preference
  useEffect(() => {
    if (window.innerWidth < 768) setViewMode("agenda")
  }, [])

  let parsedDate: Date
  try { parsedDate = parseISO(date) } catch { parsedDate = new Date() }

  const prevDate = format(subDays(parsedDate, 1), "yyyy-MM-dd")
  const nextDate = format(addDays(parsedDate, 1), "yyyy-MM-dd")
  const displayDate = format(parsedDate, "EEEE, MMMM d, yyyy")
  const isToday = date === todayString()

  function toggleSelect(compositeId: string, currentStatus: string) {
    setSelectedItems((prev) => {
      const next = new Map(prev)
      if (next.has(compositeId)) next.delete(compositeId)
      else next.set(compositeId, currentStatus)
      return next
    })
  }

  function exitSelectMode() {
    setSelectMode(false)
    setSelectedItems(new Map())
    setBulkStatus("")
    setBulkIndicator("")
  }

  async function applyBulkStatus() {
    if (!bulkStatus || selectedItems.size === 0) return
    setApplying(true)
    const snapshot = [...selectedItems.entries()] // capture before clearing
    try {
      await Promise.all(
        snapshot.map(async ([compositeId]) => {
          const isStory = compositeId.startsWith("story-")
          const id = compositeId.slice(isStory ? "story-".length : "video-".length)
          const res = await fetch(apiPath(isStory ? `/api/stories/${id}` : `/api/videos/${id}`), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: bulkStatus }),
          })
          if (!res.ok) throw new Error(`Failed to update ${compositeId}`)
        })
      )
      const n = snapshot.length
      exitSelectMode()
      setRefreshTrigger((t) => t + 1)
      toast.success(`Updated ${n} ${n === 1 ? "item" : "items"}`, {
        duration: 8000,
        action: {
          label: "Undo",
          onClick: async () => {
            await Promise.all(
              snapshot.map(async ([compositeId, originalStatus]) => {
                const isStory = compositeId.startsWith("story-")
                const id = compositeId.slice(isStory ? "story-".length : "video-".length)
                const res = await fetch(apiPath(isStory ? `/api/stories/${id}` : `/api/videos/${id}`), {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ status: originalStatus }),
                })
                if (!res.ok) throw new Error(`Failed to undo ${compositeId}`)
              })
            )
            setRefreshTrigger((t) => t + 1)
          },
        },
      })
    } catch {
      toast.error("Some updates failed — please try again.")
    } finally {
      setApplying(false)
    }
  }

  async function applyBulkIndicator() {
    if (!bulkIndicator || selectedItems.size === 0) return
    const opt = INDICATOR_OPTIONS.find((o) => o.value === bulkIndicator)
    if (!opt) return
    const snapshot = [...selectedItems.keys()]
    // Story-only indicators (AI Contributed, the editorial tags) skip video items.
    const applicable = opt.storyOnly ? snapshot.filter((id) => id.startsWith("story-")) : snapshot
    const skipped = snapshot.length - applicable.length
    if (applicable.length === 0) return // nothing to do — e.g. a story-only tag with only videos selected
    setApplying(true)
    try {
      await Promise.all(
        applicable.map(async (compositeId) => {
          const isStory = compositeId.startsWith("story-")
          const id = compositeId.slice(isStory ? "story-".length : "video-".length)
          if (opt.value === "ENTERPRISE") {
            const res = await fetch(apiPath(isStory ? `/api/stories/${id}` : `/api/videos/${id}`), {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ isEnterprise: true }),
            })
            if (!res.ok) throw new Error(`Failed to update ${compositeId}`)
          } else if (opt.value === "AI_CONTRIBUTED") {
            const res = await fetch(apiPath(`/api/stories/${id}`), {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ aiContributed: true }),
            })
            if (!res.ok) throw new Error(`Failed to update ${compositeId}`)
          } else {
            const res = await fetch(apiPath(`/api/stories/${id}/tags`), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tag: opt.value }),
            })
            // 409 = already tagged — not a failure for a bulk "add" action
            if (!res.ok && res.status !== 409) throw new Error(`Failed to update ${compositeId}`)
          }
        })
      )
      exitSelectMode()
      setRefreshTrigger((t) => t + 1)
      toast.success(
        `Added "${opt.label}" to ${applicable.length} ${applicable.length === 1 ? "item" : "items"}`
        + (skipped > 0 ? ` (skipped ${skipped} video${skipped === 1 ? "" : "s"})` : "")
      )
    } catch {
      toast.error("Some updates failed — please try again.")
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Date navigation */}
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon-sm" asChild>
            <Link href={`/budget/daily/${prevDate}`}>
              <ChevronLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <h2 className="text-lg font-semibold">{displayDate}</h2>
            {isToday && <span className="text-xs font-medium text-primary">Today</span>}
          </div>
          <Button variant="outline" size="icon-sm" asChild>
            <Link href={`/budget/daily/${nextDate}`}>
              <ChevronRight className="size-4" />
            </Link>
          </Button>
        </div>

        {/* Right controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Content type filters */}
          {VIDEOS_ENABLED && (
            <div className="flex divide-x overflow-hidden rounded-md border">
              <Button
                size="sm"
                variant="ghost"
                className={cn("rounded-none gap-1.5 text-xs", showStories && "bg-muted font-medium")}
                onClick={() => setShowStories((v) => !v)}
              >
                <FileText className="size-3.5" />
                Stories
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className={cn("rounded-none gap-1.5 text-xs", showVideos && "bg-muted font-medium")}
                onClick={() => setShowVideos((v) => !v)}
              >
                <Video className="size-3.5" />
                Videos
              </Button>
            </div>
          )}

          {/* View mode toggle — hidden on mobile (always agenda) */}
          <div className="hidden md:flex divide-x overflow-hidden rounded-md border">
            <Button
              size="sm"
              variant="ghost"
              className={cn("rounded-none gap-1.5 text-xs", viewMode === "columns" && "bg-muted font-medium")}
              onClick={() => { setViewMode("columns"); setPreferences({ defaultView: "daily-columns" }) }}
            >
              <LayoutGrid className="size-3.5" />
              Columns
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className={cn("rounded-none gap-1.5 text-xs", viewMode === "agenda" && "bg-muted font-medium")}
              onClick={() => { setViewMode("agenda"); setPreferences({ defaultView: "daily-agenda" }) }}
            >
              <List className="size-3.5" />
              Agenda
            </Button>
          </div>

          {/* Bulk select toggle */}
          <Button
            size="sm"
            variant={selectMode ? "secondary" : "outline"}
            onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
          >
            <CheckSquare className="size-3.5" />
            {selectMode ? "Selecting…" : "Select"}
          </Button>

          {/* New item buttons */}
          <Button asChild size="sm">
            <Link href="/stories/new">
              <Plus className="size-4" />
              New Story
            </Link>
          </Button>
          {VIDEOS_ENABLED && (
            <Button asChild size="sm">
              <Link href="/videos/new">
                <Plus className="size-4" />
                New Video
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      {viewMode === "columns"
        ? <ColumnsView
            date={date}
            showStories={showStories}
            showVideos={showVideos}
            selectMode={selectMode}
            selectedIds={new Set(selectedItems.keys())}
            onToggleSelect={toggleSelect}
            refreshTrigger={refreshTrigger}
          />
        : <AgendaView
            date={date}
            showStories={showStories}
            showVideos={showVideos}
            selectMode={selectMode}
            selectedIds={new Set(selectedItems.keys())}
            onToggleSelect={toggleSelect}
            refreshTrigger={refreshTrigger}
          />
      }

      {/* Bulk action bar */}
      {selectMode && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background shadow-lg">
          <div className="mx-auto flex max-w-screen-xl items-center gap-3 px-4 py-3">
            <span className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{selectedItems.size}</span>
              {" "}{selectedItems.size === 1 ? "item" : "items"} selected
            </span>
            <div className="flex-1" />
            <Select value={bulkStatus} onValueChange={setBulkStatus}>
              <SelectTrigger className="h-8 w-[180px] text-sm">
                <SelectValue placeholder="Set status…" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STORY_STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={!bulkStatus || selectedItems.size === 0 || applying}
              onClick={applyBulkStatus}
            >
              {applying ? "Applying…" : "Apply"}
            </Button>
            {(() => {
              const selectedOpt = INDICATOR_OPTIONS.find((o) => o.value === bulkIndicator)
              const applicableCount = selectedOpt
                ? (selectedOpt.storyOnly
                    ? [...selectedItems.keys()].filter((id) => id.startsWith("story-")).length
                    : selectedItems.size)
                : 0
              return (
                <>
                  <Select value={bulkIndicator} onValueChange={setBulkIndicator}>
                    <SelectTrigger className="h-8 w-[180px] text-sm">
                      <SelectValue placeholder="Add tag…" />
                    </SelectTrigger>
                    <SelectContent>
                      {INDICATOR_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    disabled={!bulkIndicator || applicableCount === 0 || applying}
                    title={selectedOpt && applicableCount === 0 ? "This tag only applies to stories — none are selected" : undefined}
                    onClick={applyBulkIndicator}
                  >
                    {applying ? "Applying…" : "Add"}
                  </Button>
                </>
              )
            })()}
            <Button size="sm" variant="ghost" onClick={exitSelectMode}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

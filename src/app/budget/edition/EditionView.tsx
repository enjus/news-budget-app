"use client"

import { useState, useCallback } from "react"
import Link from "next/link"
import useSWR from "swr"
import { format, parseISO } from "date-fns"
import { Plus, GripVertical, CalendarDays } from "lucide-react"
import { useDroppable } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core"

import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { DndProvider } from "@/components/dnd/DndProvider"
import { SortableCard } from "@/components/dnd/SortableCard"
import { StoryCard } from "@/components/budget/StoryCard"
import { cn } from "@/lib/utils"
import type { EditionDateGroup } from "@/types/index"

// ─── Types ────────────────────────────────────────────────────────────────────

interface EditionResponse {
  groups: EditionDateGroup[]
}

// ─── Fetcher ──────────────────────────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then((r) => r.json())

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatGroupDate(dateStr: string): string {
  if (dateStr === "TBD") return "TBD"
  try {
    return format(parseISO(dateStr), "EEEE, MMMM d, yyyy")
  } catch {
    return dateStr
  }
}

// Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6
const PRINT_DAYS = new Set([0, 3, 5, 6])

function getEditionType(dateStr: string): "Print/Online Newspaper" | "Online Newspaper" | null {
  if (dateStr === "TBD") return null
  try {
    const day = parseISO(dateStr).getDay()
    return PRINT_DAYS.has(day) ? "Print/Online Newspaper" : "Online Newspaper"
  } catch {
    return null
  }
}

// ─── Droppable Section ────────────────────────────────────────────────────────

interface DroppableSectionProps {
  groupDate: string
  label: string
  editionType: "Print/Online Newspaper" | "Online Newspaper" | null
  count: number
  itemIds: string[]
  newStoryHref: string
  children: React.ReactNode
}

function DroppableSection({ groupDate, label, editionType, count, itemIds, newStoryHref, children }: DroppableSectionProps) {
  const { setNodeRef, isOver } = useDroppable({ id: groupDate })

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 text-muted-foreground" />
          <h3 className="font-semibold">{label}</h3>
          {editionType && (
            <span className={cn(
              "rounded-md px-2 py-0.5 text-[10px] font-medium",
              editionType === "Print/Online Newspaper"
                ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400"
                : "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-400"
            )}>
              {editionType}
            </span>
          )}
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {count}
          </span>
        </div>
        <Link
          href={newStoryHref}
          title="New story for this edition"
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Plus className="size-3" />
          New Story
        </Link>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[80px] flex-col gap-2 rounded-lg border-2 border-dashed p-3 transition-colors",
          isOver ? "border-primary/60 bg-primary/5" : "border-border/40 bg-muted/10",
        )}
      >
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {children}
        </SortableContext>
        {count === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">Drop stories here</p>
        )}
      </div>
    </section>
  )
}

// ─── Main View ────────────────────────────────────────────────────────────────

export function EditionView() {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [calendarOpen, setCalendarOpen] = useState(false)

  const { data, isLoading, mutate } = useSWR<EditionResponse>(
    "/api/budget/edition",
    fetcher,
    { refreshInterval: 30_000 }
  )

  const [localGroups, setLocalGroups] = useState<EditionDateGroup[] | null>(null)
  const groups: EditionDateGroup[] = localGroups ?? data?.groups ?? []
  const groupDateSet = new Set(groups.map((g) => g.date))

  // ── Add date ───────────────────────────────────────────────────────────────

  const handleAddDate = useCallback(
    (selected: Date | undefined) => {
      if (!selected) return
      setCalendarOpen(false)
      const dateStr = format(selected, "yyyy-MM-dd")
      if (groups.some((g) => g.date === dateStr)) return

      const newGroups: EditionDateGroup[] = [
        ...groups,
        { date: dateStr, stories: [] },
      ].sort((a, b) => {
        if (a.date === "TBD") return 1
        if (b.date === "TBD") return -1
        return a.date.localeCompare(b.date)
      })

      setLocalGroups(newGroups)
    },
    [groups]
  )

  // ── Drag ───────────────────────────────────────────────────────────────────

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id))
  }, [])

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveId(null)
      const { active, over } = event
      if (!over) return

      const activeIdStr = String(active.id)
      const rawTarget = String(over.id)

      if (!activeIdStr.startsWith("story-")) return
      const itemId = activeIdStr.slice("story-".length)

      // Find source group
      let sourceDate: string | null = null
      for (const g of groups) {
        if (g.stories.some((s) => s.id === itemId)) {
          sourceDate = g.date
          break
        }
      }

      // Resolve target date — rawTarget may be an item id
      let targetDate = rawTarget
      if (!groupDateSet.has(rawTarget)) {
        for (const g of groups) {
          if (g.stories.some((s) => `story-${s.id}` === rawTarget)) {
            targetDate = g.date
            break
          }
        }
      }

      if (!sourceDate || targetDate === sourceDate) return

      // Optimistic update
      const newGroups: EditionDateGroup[] = groups.map((g) => ({
        ...g,
        stories: g.date === sourceDate
          ? g.stories.filter((s) => s.id !== itemId)
          : g.stories,
      }))

      let targetGroup = newGroups.find((g) => g.date === targetDate)
      if (!targetGroup) {
        targetGroup = { date: targetDate, stories: [] }
        newGroups.push(targetGroup)
        newGroups.sort((a, b) => {
          if (a.date === "TBD") return 1
          if (b.date === "TBD") return -1
          return a.date.localeCompare(b.date)
        })
      }

      const story = groups.find((g) => g.date === sourceDate)?.stories.find((s) => s.id === itemId)
      if (story) {
        newGroups.find((g) => g.date === targetDate)?.stories.push(story)
      }

      setLocalGroups(newGroups)

      // API — only update printPubDate
      try {
        let patchBody: Record<string, unknown>
        if (targetDate === "TBD") {
          patchBody = { printPubDate: null, printPubDateTBD: true }
        } else {
          const midnight = new Date(`${targetDate}T00:00:00`)
          patchBody = { printPubDate: midnight.toISOString(), printPubDateTBD: false }
        }

        await fetch(`/api/stories/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchBody),
        })
      } catch (err) {
        console.error("Failed to update edition date:", err)
        setLocalGroups(null)
        toast.error("Couldn't save — change reverted.")
      } finally {
        await mutate()
        setLocalGroups(null)
      }
    },
    [groups, groupDateSet, mutate]
  )

  // Overlay
  function overlayContent() {
    if (!activeId) return null
    const id = activeId.startsWith("story-") ? activeId.slice("story-".length) : null
    if (!id) return null
    for (const g of groups) {
      const story = g.stories.find((s) => s.id === id)
      if (story) return <StoryCard story={story} isDragging showOnlinePubDate showPhotoIndicator />
    }
    return null
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Daily Edition Stories</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="size-4" />
                Add Edition Date
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar mode="single" onSelect={handleAddDate} initialFocus />
            </PopoverContent>
          </Popover>

          <Button asChild size="sm">
            <Link href="/stories/new">
              <Plus className="size-4" />
              New Story
            </Link>
          </Button>
        </div>
      </div>

      {/* Loading */}
      {isLoading && !data ? (
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-6 w-48 rounded" />
              <Skeleton className="h-20 w-full rounded-lg" />
              <Skeleton className="h-20 w-full rounded-lg" />
            </div>
          ))}
        </div>
      ) : (
        <DndProvider
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          overlayContent={overlayContent()}
        >
          <div className="space-y-8">
            {groups.length === 0 ? (
              <div className="rounded-lg border border-dashed py-16 text-center">
                <p className="text-sm text-muted-foreground">No stories with a Daily Edition date yet.</p>
                <div className="mt-4 flex justify-center">
                  <Button asChild size="sm">
                    <Link href="/stories/new">Add a story</Link>
                  </Button>
                </div>
              </div>
            ) : (
              groups.map((group) => {
                const itemIds = group.stories.map((s) => `story-${s.id}`)

                const newStoryHref = group.date === "TBD"
                  ? "/stories/new"
                  : `/stories/new?printPubDate=${encodeURIComponent(new Date(`${group.date}T00:00:00`).toISOString())}&printPubDateTBD=false`

                return (
                  <DroppableSection
                    key={group.date}
                    groupDate={group.date}
                    label={formatGroupDate(group.date)}
                    editionType={getEditionType(group.date)}
                    count={group.stories.length}
                    itemIds={itemIds}
                    newStoryHref={newStoryHref}
                  >
                    {group.stories.map((story) => (
                      <SortableCard key={`story-${story.id}`} id={`story-${story.id}`}>
                        <div className="flex items-start gap-1">
                          <GripVertical className="mt-1 size-3 shrink-0 text-muted-foreground/40" />
                          <div className="min-w-0 flex-1">
                            <StoryCard story={story} showOnlinePubDate showPhotoIndicator />
                          </div>
                        </div>
                      </SortableCard>
                    ))}
                  </DroppableSection>
                )
              })
            )}
          </div>
        </DndProvider>
      )}
    </div>
  )
}

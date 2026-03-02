"use client"

import { useState, useCallback } from "react"
import Link from "next/link"
import useSWR from "swr"
import { format, parseISO, addDays, subDays } from "date-fns"
import { ChevronLeft, ChevronRight, Plus, GripVertical } from "lucide-react"
import { useDroppable } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import type { DragEndEvent } from "@dnd-kit/core"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { DndProvider } from "@/components/dnd/DndProvider"
import { SortableCard } from "@/components/dnd/SortableCard"
import { StoryCard } from "@/components/budget/StoryCard"
import { VideoCard } from "@/components/budget/VideoCard"
import { slotToHour } from "@/lib/utils"
import type { DailyBudgetSlot, StoryWithRelations, VideoWithRelations } from "@/types/index"

// ─── Types ────────────────────────────────────────────────────────────────────

interface DailyBudgetViewProps {
  date: string // YYYY-MM-DD
}

interface DailyBudgetResponse {
  date: string
  slots: DailyBudgetSlot[]
}

// ─── Fetcher ──────────────────────────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then((r) => r.json())

// ─── Droppable Column ─────────────────────────────────────────────────────────

interface DroppableColumnProps {
  slotId: string
  label: string
  count: number
  itemIds: string[]
  children: React.ReactNode
}

function DroppableColumn({ slotId, label, count, itemIds, children }: DroppableColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: slotId })

  return (
    <div className="flex w-64 shrink-0 flex-col">
      {/* Column header */}
      <div className="mb-2 flex items-center justify-between rounded-md bg-muted px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium text-foreground">
          {count}
        </span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={[
          "flex min-h-[120px] flex-col gap-2 rounded-lg border-2 border-dashed p-2 transition-colors",
          isOver
            ? "border-primary/60 bg-primary/5"
            : "border-border/40 bg-muted/20",
        ].join(" ")}
      >
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {children}
        </SortableContext>

        {count === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">
            Drop here
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Active drag overlay content ─────────────────────────────────────────────

interface ActiveItemOverlayProps {
  activeId: string | null
  slots: DailyBudgetSlot[]
}

function ActiveItemOverlay({ activeId, slots }: ActiveItemOverlayProps) {
  if (!activeId) return null

  for (const slot of slots) {
    if (activeId.startsWith("story-")) {
      const id = activeId.slice("story-".length)
      const story = slot.stories.find((s) => s.id === id)
      if (story) return <StoryCard story={story} isDragging />
    }
    if (activeId.startsWith("video-")) {
      const id = activeId.slice("video-".length)
      const video = slot.videos.find((v) => v.id === id)
      if (video) return <VideoCard video={video} isDragging />
    }
  }
  return null
}

// ─── Main View ────────────────────────────────────────────────────────────────

export function DailyBudgetView({ date }: DailyBudgetViewProps) {
  const [activeId, setActiveId] = useState<string | null>(null)

  // SWR fetch
  const { data, isLoading, mutate } = useSWR<DailyBudgetResponse>(
    ["/api/budget/daily", date],
    () => fetcher(`/api/budget/daily?date=${date}`)
  )

  // Local optimistic slots — initialised from API data, patched on drag
  const [localSlots, setLocalSlots] = useState<DailyBudgetSlot[] | null>(null)
  const slots: DailyBudgetSlot[] = localSlots ?? data?.slots ?? []

  // Date navigation
  let parsedDate: Date
  try {
    parsedDate = parseISO(date)
  } catch {
    parsedDate = new Date()
  }
  const prevDate = format(subDays(parsedDate, 1), "yyyy-MM-dd")
  const nextDate = format(addDays(parsedDate, 1), "yyyy-MM-dd")
  const displayDate = format(parsedDate, "EEEE, MMMM d, yyyy")
  const isToday = date === format(new Date(), "yyyy-MM-dd")

  // Reset local slots when SWR data changes (after revalidation)
  // We do this by syncing: once the mutate resolves, clear localSlots
  // so the next render uses fresh SWR data.

  // ── Visible columns ────────────────────────────────────────────────────────
  // Always show TBD. Also show any slot that has content.
  const occupiedSlotIds = new Set(
    slots.filter((s) => s.stories.length > 0 || s.videos.length > 0).map((s) => s.slot)
  )
  occupiedSlotIds.add("TBD")

  // Build a complete slot map from localSlots/API data
  const slotMap = new Map<string, DailyBudgetSlot>()
  for (const s of slots) {
    slotMap.set(s.slot, s)
  }

  const visibleSlots = Array.from(occupiedSlotIds)
    // Sort by TIME_SLOTS order
    .sort((a, b) => {
      if (a === "TBD") return -1
      if (b === "TBD") return 1
      const hourA = slotToHour(a) ?? -1
      const hourB = slotToHour(b) ?? -1
      return hourA - hourB
    })
    .map((slotId) => slotMap.get(slotId) ?? { slot: slotId, stories: [], videos: [] })

  // ── Drag handlers ──────────────────────────────────────────────────────────

  const handleDragStart = useCallback((event: { active: { id: string | number } }) => {
    setActiveId(String(event.active.id))
  }, [])

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveId(null)
      const { active, over } = event
      if (!over) return

      const activeIdStr = String(active.id)
      const targetSlot = String(over.id)

      // Determine which slot the active item currently lives in
      const isStory = activeIdStr.startsWith("story-")
      const isVideo = activeIdStr.startsWith("video-")
      if (!isStory && !isVideo) return

      const itemId = isStory
        ? activeIdStr.slice("story-".length)
        : activeIdStr.slice("video-".length)

      // Find current slot
      let sourceSlot: string | null = null
      for (const s of slots) {
        if (isStory && s.stories.some((x) => x.id === itemId)) {
          sourceSlot = s.slot
          break
        }
        if (isVideo && s.videos.some((x) => x.id === itemId)) {
          sourceSlot = s.slot
          break
        }
      }

      // If dropped on an item id (not a slot id), find which column that item belongs to
      // (SortableContext can fire over.id as another item id)
      let resolvedTargetSlot = targetSlot
      if (!occupiedSlotIds.has(targetSlot)) {
        // over.id might be an item id — resolve to its parent slot
        for (const s of slots) {
          if (
            s.stories.some((x) => `story-${x.id}` === targetSlot) ||
            s.videos.some((x) => `video-${x.id}` === targetSlot)
          ) {
            resolvedTargetSlot = s.slot
            break
          }
        }
      }

      if (!sourceSlot || resolvedTargetSlot === sourceSlot) return

      // ── Optimistic update ────────────────────────────────────────────────
      const newSlots: DailyBudgetSlot[] = slots.map((s) => {
        let stories = [...s.stories]
        let videos = [...s.videos]

        if (s.slot === sourceSlot) {
          if (isStory) stories = stories.filter((x) => x.id !== itemId)
          else videos = videos.filter((x) => x.id !== itemId)
        }

        return { slot: s.slot, stories, videos }
      })

      // If target slot not yet in list, add it
      let targetBucket = newSlots.find((s) => s.slot === resolvedTargetSlot)
      if (!targetBucket) {
        targetBucket = { slot: resolvedTargetSlot, stories: [], videos: [] }
        newSlots.push(targetBucket)
      }

      // Move the item
      const sourceItem = slots.find((s) => s.slot === sourceSlot)
      if (sourceItem) {
        if (isStory) {
          const story = sourceItem.stories.find((x) => x.id === itemId)
          if (story) {
            const target = newSlots.find((s) => s.slot === resolvedTargetSlot)
            if (target) target.stories.push(story)
          }
        } else {
          const video = sourceItem.videos.find((x) => x.id === itemId)
          if (video) {
            const target = newSlots.find((s) => s.slot === resolvedTargetSlot)
            if (target) target.videos.push(video)
          }
        }
      }

      setLocalSlots(newSlots)

      // ── API call ─────────────────────────────────────────────────────────
      try {
        let patchBody: Record<string, unknown>

        if (resolvedTargetSlot === "TBD") {
          patchBody = { onlinePubDateTBD: true, onlinePubDate: null }
        } else {
          const hour = slotToHour(resolvedTargetSlot)
          if (hour === null) {
            patchBody = { onlinePubDateTBD: true, onlinePubDate: null }
          } else {
            // Construct a UTC date for the selected date + hour
            const targetDate = new Date(`${date}T${String(hour).padStart(2, "0")}:00:00.000Z`)
            patchBody = {
              onlinePubDateTBD: false,
              onlinePubDate: targetDate.toISOString(),
            }
          }
        }

        const endpoint = isStory
          ? `/api/stories/${itemId}`
          : `/api/videos/${itemId}`

        await fetch(endpoint, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchBody),
        })
      } catch (err) {
        console.error("Failed to update item slot:", err)
      } finally {
        // Revalidate to get authoritative server state, then clear local state
        await mutate()
        setLocalSlots(null)
      }
    },
    [slots, occupiedSlotIds, date, mutate]
  )

  return (
    <div className="space-y-6">
      {/* Date navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon-sm" asChild>
            <Link href={`/budget/daily/${prevDate}`}>
              <ChevronLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <h2 className="text-lg font-semibold">{displayDate}</h2>
            {isToday && (
              <span className="text-xs font-medium text-primary">Today</span>
            )}
          </div>
          <Button variant="outline" size="icon-sm" asChild>
            <Link href={`/budget/daily/${nextDate}`}>
              <ChevronRight className="size-4" />
            </Link>
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild size="sm">
            <Link href="/stories/new">
              <Plus className="size-4" />
              New Story
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/videos/new">
              <Plus className="size-4" />
              New Video
            </Link>
          </Button>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && !data ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="w-64 shrink-0 space-y-2">
              <Skeleton className="h-8 w-full rounded-md" />
              <Skeleton className="h-20 w-full rounded-lg" />
              <Skeleton className="h-20 w-full rounded-lg" />
            </div>
          ))}
        </div>
      ) : (
        <DndProvider
          onDragEnd={handleDragEnd}
          overlayContent={
            <ActiveItemOverlay activeId={activeId} slots={slots} />
          }
        >
          {/* Horizontal scrolling columns */}
          <div
            className="flex gap-4 overflow-x-auto pb-4"
            // We need to capture dragStart from DndContext; use a wrapper attribute trick
            onPointerDown={() => {
              /* intentionally empty — DndContext handles this */
            }}
          >
            {visibleSlots.map((slotData) => {
              const itemIds = [
                ...slotData.stories.map((s) => `story-${s.id}`),
                ...slotData.videos.map((v) => `video-${v.id}`),
              ]
              const count = slotData.stories.length + slotData.videos.length

              return (
                <DroppableColumn
                  key={slotData.slot}
                  slotId={slotData.slot}
                  label={slotData.slot}
                  count={count}
                  itemIds={itemIds}
                >
                  {slotData.stories.map((story) => (
                    <SortableCard key={`story-${story.id}`} id={`story-${story.id}`}>
                      <div className="flex items-start gap-1">
                        <GripVertical className="mt-1 size-3 shrink-0 text-muted-foreground/40" />
                        <div className="min-w-0 flex-1">
                          <StoryCard story={story} />
                        </div>
                      </div>
                    </SortableCard>
                  ))}
                  {slotData.videos.map((video) => (
                    <SortableCard key={`video-${video.id}`} id={`video-${video.id}`}>
                      <div className="flex items-start gap-1">
                        <GripVertical className="mt-1 size-3 shrink-0 text-muted-foreground/40" />
                        <div className="min-w-0 flex-1">
                          <VideoCard video={video} />
                        </div>
                      </div>
                    </SortableCard>
                  ))}
                </DroppableColumn>
              )
            })}

            {/* Empty state when no slots */}
            {visibleSlots.every(
              (s) => s.stories.length === 0 && s.videos.length === 0
            ) && (
              <div className="flex w-full flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
                <p className="text-sm text-muted-foreground">
                  No stories or videos scheduled for this day.
                </p>
                <div className="mt-4 flex gap-2">
                  <Button asChild size="sm">
                    <Link href="/stories/new">Add a story</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/videos/new">Add a video</Link>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DndProvider>
      )}
    </div>
  )
}

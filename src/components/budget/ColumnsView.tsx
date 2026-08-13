"use client"

import { useState, useCallback, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import { format, parseISO, addDays } from "date-fns"
import { Plus, Info, Sunrise } from "lucide-react"
import { useDroppable } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core"

import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { DndProvider } from "@/components/dnd/DndProvider"
import { SortableCard } from "@/components/dnd/SortableCard"
import { StoryCard } from "@/components/budget/StoryCard"
import { VideoCard } from "@/components/budget/VideoCard"
import { TIME_BUCKETS, cn } from "@/lib/utils"
import { personIdsQueryParts, excludeReporterIdsQueryParts } from "@/lib/budget-query"
import type { DailyBudgetSlot } from "@/types/index"
import { apiPath } from "@/lib/api-path"
import { VIDEOS_ENABLED } from "@/lib/features"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ColumnsViewProps {
  date: string // YYYY-MM-DD
  showStories: boolean
  showVideos: boolean
  selectMode: boolean
  selectedIds: Set<string>
  onToggleSelect: (compositeId: string, currentStatus: string) => void
  refreshTrigger: number
  /** Scope to only stories/videos assigned to these person IDs (team-filtered views). */
  personIds?: string[]
  /** Hide stories/videos whose only REPORTER assignees are in this list (Daily view team filter). */
  excludeReporterIds?: string[]
  /** Whether to show the per-bucket "+ Story / + Video" quick-add buttons. Defaults to true. */
  showNewButtons?: boolean
  /** SWR cache-key namespace, so a filtered view's cache never collides with the unfiltered one. */
  cacheKeyPrefix?: string
}

interface DailyBudgetResponse {
  date: string
  slots: DailyBudgetSlot[]
}

// ─── Fetcher ──────────────────────────────────────────────────────────────────

const fetcher = (url: string) => fetch(apiPath(url)).then((r) => r.json())

// ─── Next Morning Drop Zone ───────────────────────────────────────────────────

function NextMorningDropZone({ nextDate }: { nextDate: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: "NEXT_MORNING" })
  const label = format(parseISO(nextDate), "EEE, MMM d")

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "mt-2 flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-2 py-1.5 text-xs transition-colors",
        isOver
          ? "border-amber-400/60 bg-amber-50/50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
          : "border-border/40 text-muted-foreground",
      )}
    >
      <Sunrise className="size-3.5 shrink-0" />
      <span>Next morning · {label}, 6 AM</span>
    </div>
  )
}

// ─── Droppable Column ─────────────────────────────────────────────────────────

interface DroppableColumnProps {
  slotId: string
  label: string
  description: string
  count: number
  itemIds: string[]
  newStoryHref: string
  newVideoHref: string
  nextMorningDate?: string
  showNewButtons: boolean
  children: React.ReactNode
}

function DroppableColumn({
  slotId, label, description, count, itemIds, newStoryHref, newVideoHref, nextMorningDate, showNewButtons, children,
}: DroppableColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: slotId })

  return (
    <div className="flex min-w-0 flex-col">
      <div className="mb-2 flex items-center justify-between rounded-md bg-muted px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          {description && (
            <span title={description} className="inline-flex cursor-help items-center">
              <Info className="size-3 shrink-0 pointer-events-none text-muted-foreground/50" />
            </span>
          )}
        </div>
        <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium text-foreground">
          {count}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[120px] flex-col gap-2 rounded-lg border-2 border-dashed p-2 transition-colors",
          isOver ? "border-primary/60 bg-primary/5" : "border-border/40 bg-muted/20",
        )}
      >
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {children}
        </SortableContext>
        {count === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">Drop here</p>
        )}
      </div>
      {showNewButtons && (
        <div className="mt-2 flex gap-1.5">
          <Button asChild size="sm" variant="outline" className="flex-1 gap-1.5 text-xs">
            <Link href={newStoryHref}>
              <Plus className="size-3.5" />
              Story
            </Link>
          </Button>
          {VIDEOS_ENABLED && (
            <Button asChild size="sm" variant="outline" className="flex-1 gap-1.5 text-xs">
              <Link href={newVideoHref}>
                <Plus className="size-3.5" />
                Video
              </Link>
            </Button>
          )}
        </div>
      )}
      {nextMorningDate && <NextMorningDropZone nextDate={nextMorningDate} />}
    </div>
  )
}

// ─── Columns View ─────────────────────────────────────────────────────────────

const BUCKET_IDS = new Set(TIME_BUCKETS.map((b) => b.id))

export function ColumnsView({
  date, showStories, showVideos, selectMode, selectedIds, onToggleSelect, refreshTrigger,
  personIds, excludeReporterIds, showNewButtons = true, cacheKeyPrefix = "/api/budget/daily",
}: ColumnsViewProps) {
  const router = useRouter()
  const [activeId, setActiveId] = useState<string | null>(null)

  const { cacheKey: personIdsKey, querySuffix } = personIdsQueryParts(personIds)
  const { cacheKey: excludeKey, querySuffix: excludeSuffix } = excludeReporterIdsQueryParts(excludeReporterIds)
  const queryUrl = `/api/budget/daily?date=${date}${querySuffix}${excludeSuffix}`

  const { data, isLoading, mutate } = useSWR<DailyBudgetResponse>(
    [cacheKeyPrefix, date, personIdsKey, excludeKey],
    () => fetcher(queryUrl),
    { refreshInterval: 30_000 }
  )

  const [localSlots, setLocalSlots] = useState<DailyBudgetSlot[] | null>(null)
  const apiSlots: DailyBudgetSlot[] = localSlots ?? data?.slots ?? []

  useEffect(() => {
    if (refreshTrigger > 0) mutate()
  }, [refreshTrigger, mutate])

  const slotMap = new Map<string, DailyBudgetSlot>()
  for (const s of apiSlots) slotMap.set(s.slot, s)
  const visibleSlots = TIME_BUCKETS.map(
    (b) => slotMap.get(b.id) ?? { slot: b.id, stories: [], videos: [] }
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id))
  }, [])

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveId(null)
      const { active, over } = event
      if (!over) return

      const activeIdStr = String(active.id)
      const overIdStr = String(over.id)
      if (overIdStr === activeIdStr) return // dropped on itself — no-op

      const isStory = activeIdStr.startsWith("story-")
      const isVideo = activeIdStr.startsWith("video-")
      if (!isStory && !isVideo) return

      const itemId = activeIdStr.slice(isStory ? "story-".length : "video-".length)

      let sourceSlot: string | null = null
      for (const s of visibleSlots) {
        if (isStory && s.stories.some((x) => x.id === itemId)) { sourceSlot = s.slot; break }
        if (isVideo && s.videos.some((x) => x.id === itemId)) { sourceSlot = s.slot; break }
      }
      if (!sourceSlot) return
      const sourceItem = visibleSlots.find((s) => s.slot === sourceSlot)
      if (!sourceItem) return

      // over.id is either a bucket/drop-zone id (dropped in empty space) or
      // another card's composite id (dropped near a specific card — used to
      // resolve both which bucket it landed in and where within it).
      let resolvedTargetSlot = overIdStr
      let beforeItemId: string | null = null
      if (overIdStr !== "NEXT_MORNING" && !BUCKET_IDS.has(overIdStr)) {
        beforeItemId = overIdStr
        for (const s of visibleSlots) {
          if (
            s.stories.some((x) => `story-${x.id}` === overIdStr) ||
            s.videos.some((x) => `video-${x.id}` === overIdStr)
          ) {
            resolvedTargetSlot = s.slot
            break
          }
        }
      }

      // ─── Move to the next-morning drop zone ──────────────────────────────
      if (resolvedTargetSlot === "NEXT_MORNING") {
        const newSlots: DailyBudgetSlot[] = visibleSlots.map((s) => {
          if (s.slot !== sourceSlot) return s
          return isStory
            ? { ...s, stories: s.stories.filter((x) => x.id !== itemId) }
            : { ...s, videos: s.videos.filter((x) => x.id !== itemId) }
        })
        setLocalSlots(newSlots)

        const nextDate = format(addDays(parseISO(date), 1), "yyyy-MM-dd")
        const patchBody = { onlinePubDateTBD: false, onlinePubDate: `${nextDate}T06:00:00.000Z` }
        const nextMorningLabel = `Moved to ${format(parseISO(nextDate), "EEE, MMM d")} at 6:00 AM`
        const origItem = isStory
          ? sourceItem.stories.find((s) => s.id === itemId)
          : sourceItem.videos.find((v) => v.id === itemId)
        const undoPayload = {
          onlinePubDateTBD: origItem?.onlinePubDateTBD ?? true,
          onlinePubDate: origItem?.onlinePubDate ? new Date(origItem.onlinePubDate).toISOString() : null,
        }
        const endpoint = apiPath(isStory ? `/api/stories/${itemId}` : `/api/videos/${itemId}`)

        try {
          const res = await fetch(endpoint, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patchBody),
          })
          if (!res.ok) throw new Error(`PATCH ${endpoint} failed with ${res.status}`)

          toast.success(nextMorningLabel, {
            duration: 8000,
            action: {
              label: "Undo",
              onClick: async () => {
                await fetch(endpoint, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(undoPayload),
                })
                await mutate()
              },
            },
            cancel: {
              label: "View",
              onClick: () => router.push(`/budget/daily/${nextDate}`),
            },
          })
        } catch (err) {
          console.error("Failed to update item slot:", err)
          setLocalSlots(null)
          toast.error("Couldn't save — change reverted.")
        } finally {
          await mutate()
          setLocalSlots(null)
        }
        return
      }

      // Unresolved drop target (shouldn't normally happen) — bail safely.
      if (!BUCKET_IDS.has(resolvedTargetSlot)) return

      // ─── Reorder within a bucket, or move into a different bucket ───────
      const targetSlotData = visibleSlots.find((s) => s.slot === resolvedTargetSlot)
      if (!targetSlotData) return

      const sameBucket = resolvedTargetSlot === sourceSlot

      // Reorders a same-type list: drop the moving item, reinsert it before
      // `beforeCompositeId` (or at the end), and report which items' sortOrder
      // actually moved via a dense 0..n-1 reindex.
      function reorder<T extends { id: string; sortOrder: number }>(
        list: T[],
        movingItem: T,
        prefix: "story" | "video"
      ) {
        const ordered = list.filter((x) => x.id !== movingItem.id)
        let insertIndex = ordered.length // default: append at the end
        if (beforeItemId) {
          const idx = ordered.findIndex((x) => `${prefix}-${x.id}` === beforeItemId)
          if (idx !== -1) insertIndex = idx
        }
        ordered.splice(insertIndex, 0, movingItem)
        const unchanged =
          sameBucket && list.length === ordered.length && list.every((x, i) => x.id === ordered[i].id)
        const sortPatches = ordered
          .map((item, index) => ({ id: item.id, sortOrder: index, changed: item.sortOrder !== index }))
          .filter((p) => p.changed)
        return { ordered, unchanged, sortPatches }
      }

      let newSlots: DailyBudgetSlot[]
      let sortPatches: { id: string; sortOrder: number }[]

      if (isStory) {
        const movingItem = sourceItem.stories.find((x) => x.id === itemId)
        if (!movingItem) return
        const { ordered, unchanged, sortPatches: patches } = reorder(targetSlotData.stories, movingItem, "story")
        if (unchanged) return // dropped back where it started
        sortPatches = patches
        newSlots = visibleSlots.map((s) => {
          if (s.slot === resolvedTargetSlot) return { ...s, stories: ordered }
          if (s.slot === sourceSlot && !sameBucket) return { ...s, stories: s.stories.filter((x) => x.id !== itemId) }
          return s
        })
      } else {
        const movingItem = sourceItem.videos.find((x) => x.id === itemId)
        if (!movingItem) return
        const { ordered, unchanged, sortPatches: patches } = reorder(targetSlotData.videos, movingItem, "video")
        if (unchanged) return // dropped back where it started
        sortPatches = patches
        newSlots = visibleSlots.map((s) => {
          if (s.slot === resolvedTargetSlot) return { ...s, videos: ordered }
          if (s.slot === sourceSlot && !sameBucket) return { ...s, videos: s.videos.filter((x) => x.id !== itemId) }
          return s
        })
      }
      setLocalSlots(newSlots)

      try {
        const requests: Promise<Response>[] = sortPatches.map((p) =>
          fetch(apiPath(isStory ? `/api/stories/${p.id}` : `/api/videos/${p.id}`), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sortOrder: p.sortOrder }),
          })
        )

        if (!sameBucket) {
          const targetBucket = TIME_BUCKETS.find((b) => b.id === resolvedTargetSlot)
          const patchBody =
            !targetBucket || targetBucket.defaultHour === null
              ? { onlinePubDateTBD: true, onlinePubDate: null }
              : {
                  onlinePubDateTBD: false,
                  onlinePubDate: `${date}T${String(targetBucket.defaultHour).padStart(2, "0")}:${String(targetBucket.defaultMinute ?? 0).padStart(2, "0")}:00.000Z`,
                }
          requests.push(
            fetch(apiPath(isStory ? `/api/stories/${itemId}` : `/api/videos/${itemId}`), {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(patchBody),
            })
          )
        }

        const results = await Promise.all(requests)
        if (results.some((r) => !r.ok)) {
          throw new Error("One or more PATCH requests failed")
        }
      } catch (err) {
        console.error("Failed to update item order:", err)
        setLocalSlots(null)
        toast.error("Couldn't save — change reverted.")
      } finally {
        await mutate()
        setLocalSlots(null)
      }
    },
    [visibleSlots, date, mutate, router]
  )

  // Overlay: find active item across all slots
  function overlayContent() {
    if (!activeId) return null
    for (const slot of visibleSlots) {
      if (activeId.startsWith("story-")) {
        const story = slot.stories.find((s) => s.id === activeId.slice("story-".length))
        if (story) return <StoryCard story={story} isDragging showWordCount showPhotoIndicator videoCount={story.videos.length} />
      }
      if (activeId.startsWith("video-")) {
        const video = slot.videos.find((v) => v.id === activeId.slice("video-".length))
        if (video) return <VideoCard video={video} isDragging />
      }
    }
    return null
  }

  const nextDate = format(addDays(parseISO(date), 1), "yyyy-MM-dd")

  const hasAnyContent = visibleSlots.some((s) => {
    const sc = showStories ? s.stories.length : 0
    const vc = showVideos ? s.videos.length : 0
    return sc + vc > 0
  })

  if (isLoading && !data) {
    return (
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:overflow-visible sm:px-0">
        <div className="grid grid-cols-5 gap-4 min-w-[600px]">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-8 w-full rounded-md" />
              <Skeleton className="h-20 w-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <DndProvider
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      overlayContent={overlayContent()}
    >
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:overflow-visible sm:px-0">
      <div className="grid grid-cols-5 gap-4 min-w-[600px]">
        {visibleSlots.map((slotData) => {
          const bucketDef = TIME_BUCKETS.find((b) => b.id === slotData.slot)

          const buildItemUrl = (type: "stories" | "videos") => {
            if (!bucketDef || bucketDef.defaultHour === null) return `/${type}/new?onlinePubDateTBD=true`
            const h = String(bucketDef.defaultHour).padStart(2, "0")
            const m = String(bucketDef.defaultMinute ?? 0).padStart(2, "0")
            const iso = encodeURIComponent(`${date}T${h}:${m}:00.000Z`)
            return `/${type}/new?onlinePubDate=${iso}&onlinePubDateTBD=false`
          }

          const stories = showStories ? slotData.stories : []
          const videos = showVideos ? slotData.videos : []
          const itemIds = [...stories.map((s) => `story-${s.id}`), ...videos.map((v) => `video-${v.id}`)]
          const count = stories.length + videos.length

          return (
            <DroppableColumn
              key={slotData.slot}
              slotId={slotData.slot}
              label={bucketDef?.label ?? slotData.slot}
              description={bucketDef?.description ?? ""}
              count={count}
              itemIds={itemIds}
              newStoryHref={buildItemUrl("stories")}
              newVideoHref={buildItemUrl("videos")}
              nextMorningDate={slotData.slot === "EVENING" ? nextDate : undefined}
              showNewButtons={showNewButtons}
            >
              {stories.map((story) => (
                <SortableCard key={`story-${story.id}`} id={`story-${story.id}`} handle disabled={selectMode}>
                  <StoryCard
                    story={story}
                    showWordCount
                    showPhotoIndicator
                    videoCount={story.videos.length}
                    selectMode={selectMode}
                    isSelected={selectedIds.has(`story-${story.id}`)}
                    onToggleSelect={() => onToggleSelect(`story-${story.id}`, story.status)}
                  />
                </SortableCard>
              ))}
              {videos.map((video) => (
                <SortableCard key={`video-${video.id}`} id={`video-${video.id}`} handle disabled={selectMode}>
                  <VideoCard
                    video={video}
                    selectMode={selectMode}
                    isSelected={selectedIds.has(`video-${video.id}`)}
                    onToggleSelect={() => onToggleSelect(`video-${video.id}`, video.status)}
                  />
                </SortableCard>
              ))}
            </DroppableColumn>
          )
        })}
      </div>

      </div>{/* end scroll wrapper */}

      {!hasAnyContent && (
        <div className="mt-4 flex w-full flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm text-muted-foreground">No stories or videos scheduled for this day.</p>
          {showNewButtons && (
            <div className="mt-4 flex gap-2">
              <Button asChild size="sm"><Link href="/stories/new">Add a story</Link></Button>
              <Button asChild size="sm" variant="outline"><Link href="/videos/new">Add a video</Link></Button>
            </div>
          )}
        </div>
      )}
    </DndProvider>
  )
}

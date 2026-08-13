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
      const targetSlot = String(over.id)
      const isStory = activeIdStr.startsWith("story-")
      const isVideo = activeIdStr.startsWith("video-")
      if (!isStory && !isVideo) return

      const itemId = isStory ? activeIdStr.slice("story-".length) : activeIdStr.slice("video-".length)

      let sourceSlot: string | null = null
      for (const s of visibleSlots) {
        if (isStory && s.stories.some((x) => x.id === itemId)) { sourceSlot = s.slot; break }
        if (isVideo && s.videos.some((x) => x.id === itemId)) { sourceSlot = s.slot; break }
      }

      let resolvedTargetSlot = targetSlot
      if (!BUCKET_IDS.has(targetSlot)) {
        for (const s of visibleSlots) {
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

      const sourceItem = visibleSlots.find((s) => s.slot === sourceSlot)
      const newSlots: DailyBudgetSlot[] = visibleSlots.map((s) => {
        let stories = [...s.stories]
        let videos = [...s.videos]
        if (s.slot === sourceSlot) {
          if (isStory) stories = stories.filter((x) => x.id !== itemId)
          else videos = videos.filter((x) => x.id !== itemId)
        }
        if (s.slot === resolvedTargetSlot && sourceItem) {
          if (isStory) {
            const story = sourceItem.stories.find((x) => x.id === itemId)
            if (story) stories = [...stories, story]
          } else {
            const video = sourceItem.videos.find((x) => x.id === itemId)
            if (video) videos = [...videos, video]
          }
        }
        return { slot: s.slot, stories, videos }
      })

      setLocalSlots(newSlots)

      try {
        let patchBody: Record<string, unknown>
        let undoPayload: Record<string, unknown> | null = null
        let nextMorningLabel = ""

        if (resolvedTargetSlot === "NEXT_MORNING") {
          const nextDate = format(addDays(parseISO(date), 1), "yyyy-MM-dd")
          patchBody = { onlinePubDateTBD: false, onlinePubDate: `${nextDate}T06:00:00.000Z` }
          nextMorningLabel = `Moved to ${format(parseISO(nextDate), "EEE, MMM d")} at 6:00 AM`
          const origItem = isStory
            ? sourceItem?.stories.find((s) => s.id === itemId)
            : sourceItem?.videos.find((v) => v.id === itemId)
          undoPayload = {
            onlinePubDateTBD: origItem?.onlinePubDateTBD ?? true,
            onlinePubDate: origItem?.onlinePubDate
              ? new Date(origItem.onlinePubDate).toISOString()
              : null,
          }
        } else {
          const targetBucket = TIME_BUCKETS.find((b) => b.id === resolvedTargetSlot)
          if (!targetBucket || targetBucket.defaultHour === null) {
            patchBody = { onlinePubDateTBD: true, onlinePubDate: null }
          } else {
            const h = String(targetBucket.defaultHour).padStart(2, "0")
            const m = String(targetBucket.defaultMinute ?? 0).padStart(2, "0")
            patchBody = {
              onlinePubDateTBD: false,
              onlinePubDate: `${date}T${h}:${m}:00.000Z`,
            }
          }
        }
        const endpoint = apiPath(isStory ? `/api/stories/${itemId}` : `/api/videos/${itemId}`)
        const res = await fetch(endpoint, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchBody),
        })
        if (!res.ok) {
          throw new Error(`PATCH ${endpoint} failed with ${res.status}`)
        }
        if (undoPayload) {
          const frozenUndo = undoPayload
          const frozenNextDate = format(addDays(parseISO(date), 1), "yyyy-MM-dd")
          toast.success(nextMorningLabel, {
            duration: 8000,
            action: {
              label: "Undo",
              onClick: async () => {
                await fetch(endpoint, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(frozenUndo),
                })
                await mutate()
              },
            },
            cancel: {
              label: "View",
              onClick: () => router.push(`/budget/daily/${frozenNextDate}`),
            },
          })
        }
      } catch (err) {
        console.error("Failed to update item slot:", err)
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

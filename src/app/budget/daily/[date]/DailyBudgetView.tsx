"use client"

import { useState, useCallback } from "react"
import Link from "next/link"
import useSWR from "swr"
import { format, parseISO, addDays, subDays } from "date-fns"
import {
  ChevronLeft, ChevronRight, ChevronDown, Plus, GripVertical,
  Info, FileText, Video, LayoutGrid, List,
} from "lucide-react"
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
import { TIME_BUCKETS, dateToBucket, cn } from "@/lib/utils"
import type { DailyBudgetSlot, StoryListItem, VideoWithRelations } from "@/types/index"
import type { AgendaDay, AgendaResponse } from "@/app/api/budget/agenda/route"

// ─── Types ────────────────────────────────────────────────────────────────────

interface DailyBudgetViewProps {
  date: string // YYYY-MM-DD
}

interface DailyBudgetResponse {
  date: string
  slots: DailyBudgetSlot[]
}

interface ContentViewProps {
  date: string
  showStories: boolean
  showVideos: boolean
}

// ─── Fetcher ──────────────────────────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then((r) => r.json())

// ─── Droppable Column (column view) ───────────────────────────────────────────

interface DroppableColumnProps {
  slotId: string
  label: string
  description: string
  count: number
  itemIds: string[]
  newStoryHref: string
  newVideoHref: string
  children: React.ReactNode
}

function DroppableColumn({
  slotId, label, description, count, itemIds, newStoryHref, newVideoHref, children,
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
      <div className="mt-2 flex gap-1.5">
        <Button asChild size="sm" variant="outline" className="flex-1 gap-1.5 text-xs">
          <Link href={newStoryHref}>
            <Plus className="size-3.5" />
            Story
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="flex-1 gap-1.5 text-xs">
          <Link href={newVideoHref}>
            <Plus className="size-3.5" />
            Video
          </Link>
        </Button>
      </div>
    </div>
  )
}

// ─── Columns View ─────────────────────────────────────────────────────────────

const BUCKET_IDS = new Set(TIME_BUCKETS.map((b) => b.id))

function ColumnsView({ date, showStories, showVideos }: ContentViewProps) {
  const [activeId, setActiveId] = useState<string | null>(null)

  const { data, isLoading, mutate } = useSWR<DailyBudgetResponse>(
    ["/api/budget/daily", date],
    () => fetcher(`/api/budget/daily?date=${date}`),
    { refreshInterval: 30_000 }
  )

  const [localSlots, setLocalSlots] = useState<DailyBudgetSlot[] | null>(null)
  const apiSlots: DailyBudgetSlot[] = localSlots ?? data?.slots ?? []

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
        const targetBucket = TIME_BUCKETS.find((b) => b.id === resolvedTargetSlot)
        let patchBody: Record<string, unknown>
        if (!targetBucket || targetBucket.defaultHour === null) {
          patchBody = { onlinePubDateTBD: true, onlinePubDate: null }
        } else {
          const h = String(targetBucket.defaultHour).padStart(2, "0")
          const m = String(targetBucket.defaultMinute ?? 0).padStart(2, "0")
          // Store as newsroom-time-as-UTC: 7:30 AM → "...T07:30:00.000Z"
          patchBody = {
            onlinePubDateTBD: false,
            onlinePubDate: `${date}T${h}:${m}:00.000Z`,
          }
        }
        const endpoint = isStory ? `/api/stories/${itemId}` : `/api/videos/${itemId}`
        await fetch(endpoint, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchBody),
        })
      } catch (err) {
        console.error("Failed to update item slot:", err)
        setLocalSlots(null)
        toast.error("Couldn't save — change reverted.")
      } finally {
        await mutate()
        setLocalSlots(null)
      }
    },
    [visibleSlots, date, mutate]
  )

  // Overlay: find active item across all slots
  function overlayContent() {
    if (!activeId) return null
    for (const slot of visibleSlots) {
      if (activeId.startsWith("story-")) {
        const story = slot.stories.find((s) => s.id === activeId.slice("story-".length))
        if (story) return <StoryCard story={story} isDragging showWordCount showPhotoIndicator />
      }
      if (activeId.startsWith("video-")) {
        const video = slot.videos.find((v) => v.id === activeId.slice("video-".length))
        if (video) return <VideoCard video={video} isDragging />
      }
    }
    return null
  }

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
            >
              {stories.map((story) => (
                <SortableCard key={`story-${story.id}`} id={`story-${story.id}`}>
                  <div className="flex items-start gap-1">
                    <GripVertical className="mt-1 size-3 shrink-0 text-muted-foreground/40" />
                    <div className="min-w-0 flex-1"><StoryCard story={story} showWordCount showPhotoIndicator /></div>
                  </div>
                </SortableCard>
              ))}
              {videos.map((video) => (
                <SortableCard key={`video-${video.id}`} id={`video-${video.id}`}>
                  <div className="flex items-start gap-1">
                    <GripVertical className="mt-1 size-3 shrink-0 text-muted-foreground/40" />
                    <div className="min-w-0 flex-1"><VideoCard video={video} /></div>
                  </div>
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
          <div className="mt-4 flex gap-2">
            <Button asChild size="sm"><Link href="/stories/new">Add a story</Link></Button>
            <Button asChild size="sm" variant="outline"><Link href="/videos/new">Add a video</Link></Button>
          </div>
        </div>
      )}
    </DndProvider>
  )
}

// ─── Agenda Day Row ───────────────────────────────────────────────────────────

interface AgendaDayRowProps {
  dateKey: string
  label: string
  isToday: boolean
  itemIds: string[]
  count: number
  hideHeader?: boolean
  children: React.ReactNode
}

function AgendaDayRow({ dateKey, label, isToday, itemIds, count, hideHeader, children }: AgendaDayRowProps) {
  const { setNodeRef, isOver } = useDroppable({ id: dateKey })

  return (
    <div className="space-y-2">
      {!hideHeader && (
        <div className="flex items-center gap-2">
          <h3 className={cn("text-sm font-semibold", isToday && "text-primary")}>{label}</h3>
          {isToday && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              Today
            </span>
          )}
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {count}
          </span>
        </div>
      )}
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[64px] flex-col gap-2 rounded-lg border-2 border-dashed p-3 transition-colors",
          isOver ? "border-primary/60 bg-primary/5" : "border-border/40 bg-muted/10",
        )}
      >
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {children}
        </SortableContext>
        {count === 0 && (
          <p className="py-1 text-center text-xs text-muted-foreground">Drop here</p>
        )}
      </div>
    </div>
  )
}

// ─── Agenda View ──────────────────────────────────────────────────────────────

const BUCKET_NAMES: Record<string, string> = {
  MORNING:   "Early",
  MIDDAY:    "Morning",
  AFTERNOON: "Afternoon",
  EVENING:   "Evening",
}

function AgendaView({ date, showStories, showVideos }: ContentViewProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [tbdExpanded, setTbdExpanded] = useState(false)

  const { data, isLoading, mutate } = useSWR<AgendaResponse>(
    ["/api/budget/agenda", date],
    () => fetcher(`/api/budget/agenda?start=${date}`),
    { refreshInterval: 30_000 }
  )

  const [localData, setLocalData] = useState<AgendaResponse | null>(null)
  const currentData = localData ?? data

  const allDateKeys = new Set([
    ...(currentData?.days.map((d) => d.date) ?? []),
    "TBD",
  ])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id))
  }, [])

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveId(null)
      const { active, over } = event
      if (!over || !currentData) return

      const activeIdStr = String(active.id)
      const rawTarget = String(over.id)
      const isStory = activeIdStr.startsWith("story-")
      const isVideo = activeIdStr.startsWith("video-")
      if (!isStory && !isVideo) return

      const itemId = isStory ? activeIdStr.slice("story-".length) : activeIdStr.slice("video-".length)

      // Find source group and item
      const allGroups: AgendaDay[] = [...currentData.days, currentData.tbd]
      let sourceDate: string | null = null
      let sourceItem: StoryListItem | VideoWithRelations | null = null

      for (const group of allGroups) {
        if (isStory) {
          const story = group.stories.find((s) => s.id === itemId)
          if (story) { sourceDate = group.date; sourceItem = story; break }
        } else {
          const video = group.videos.find((v) => v.id === itemId)
          if (video) { sourceDate = group.date; sourceItem = video; break }
        }
      }

      // Resolve target date (rawTarget may be an item id, not a date key)
      let targetDate = rawTarget
      if (!allDateKeys.has(rawTarget)) {
        for (const group of allGroups) {
          if (
            group.stories.some((s) => `story-${s.id}` === rawTarget) ||
            group.videos.some((v) => `video-${v.id}` === rawTarget)
          ) {
            targetDate = group.date
            break
          }
        }
      }

      if (!sourceDate || targetDate === sourceDate) return

      // Optimistic update
      const updatedDays = currentData.days.map((day) => ({
        ...day,
        stories: isStory ? day.stories.filter((s) => s.id !== itemId) : day.stories,
        videos: isVideo ? day.videos.filter((v) => v.id !== itemId) : day.videos,
      }))
      const updatedTbd = {
        ...currentData.tbd,
        stories: isStory ? currentData.tbd.stories.filter((s) => s.id !== itemId) : currentData.tbd.stories,
        videos: isVideo ? currentData.tbd.videos.filter((v) => v.id !== itemId) : currentData.tbd.videos,
      }

      if (targetDate === "TBD") {
        if (isStory && sourceItem) updatedTbd.stories.push(sourceItem as StoryListItem)
        else if (isVideo && sourceItem) updatedTbd.videos.push(sourceItem as VideoWithRelations)
      } else {
        const idx = updatedDays.findIndex((d) => d.date === targetDate)
        if (idx >= 0) {
          if (isStory && sourceItem) updatedDays[idx].stories.push(sourceItem as StoryListItem)
          else if (isVideo && sourceItem) updatedDays[idx].videos.push(sourceItem as VideoWithRelations)
        }
      }

      setLocalData({ ...currentData, days: updatedDays, tbd: updatedTbd })

      // API — preserve time when moving day-to-day; use midnight when coming from TBD
      try {
        let patchBody: Record<string, unknown>
        if (targetDate === "TBD") {
          patchBody = { onlinePubDateTBD: true, onlinePubDate: null }
        } else {
          let newIso: string
          if (sourceItem && !sourceItem.onlinePubDateTBD && sourceItem.onlinePubDate) {
            // Preserve time-of-day using UTC values (newsroom-time-as-UTC convention)
            const existing = new Date(sourceItem.onlinePubDate)
            const h = String(existing.getUTCHours()).padStart(2, "0")
            const m = String(existing.getUTCMinutes()).padStart(2, "0")
            newIso = `${targetDate}T${h}:${m}:00.000Z`
          } else {
            newIso = `${targetDate}T00:00:00.000Z`
          }
          patchBody = { onlinePubDateTBD: false, onlinePubDate: newIso }
        }
        const endpoint = isStory ? `/api/stories/${itemId}` : `/api/videos/${itemId}`
        await fetch(endpoint, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchBody),
        })
      } catch (err) {
        console.error("Failed to update agenda item date:", err)
        setLocalData(null)
        toast.error("Couldn't save — change reverted.")
      } finally {
        await mutate()
        setLocalData(null)
      }
    },
    [currentData, allDateKeys, mutate]
  )

  function overlayContent() {
    if (!activeId || !currentData) return null
    const allGroups: AgendaDay[] = [...currentData.days, currentData.tbd]
    if (activeId.startsWith("story-")) {
      const id = activeId.slice("story-".length)
      for (const g of allGroups) {
        const story = g.stories.find((s) => s.id === id)
        if (story) return <StoryCard story={story} isDragging showWordCount showPhotoIndicator />
      }
    }
    if (activeId.startsWith("video-")) {
      const id = activeId.slice("video-".length)
      for (const g of allGroups) {
        const video = g.videos.find((v) => v.id === id)
        if (video) return <VideoCard video={video} isDragging />
      }
    }
    return null
  }

  const today = format(new Date(), "yyyy-MM-dd")

  if (isLoading && !data) {
    return (
      <div className="space-y-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        ))}
      </div>
    )
  }

  if (!currentData) return null

  const allGroups: AgendaDay[] = [...currentData.days, currentData.tbd]
  const tbdGroup = currentData.tbd
  const tbdStories = showStories ? tbdGroup.stories : []
  const tbdVideos = showVideos ? tbdGroup.videos : []
  const tbdCount = tbdStories.length + tbdVideos.length

  return (
    <DndProvider
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      overlayContent={overlayContent()}
    >
      <div className="space-y-6">
        {/* ── TBD (collapsible, top) ── */}
        {tbdCount > 0 && (
          <div className="space-y-3">
            <button
              onClick={() => setTbdExpanded((v) => !v)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronDown className={cn("size-4 transition-transform", tbdExpanded && "rotate-180")} />
              <span className="font-medium">TBD — No scheduled date</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                {tbdCount}
              </span>
            </button>
            {tbdExpanded && (() => {
              const tbdMerged = [
                ...tbdStories.map((item) => ({ kind: "story" as const, item })),
                ...tbdVideos.map((item) => ({ kind: "video" as const, item })),
              ]
              const tbdItemIds = tbdMerged.map((m) => `${m.kind}-${m.item.id}`)
              return (
                <div className="border-l-2 border-border/40 pl-6">
                  <AgendaDayRow
                    dateKey="TBD"
                    label=""
                    isToday={false}
                    itemIds={tbdItemIds}
                    count={tbdCount}
                    hideHeader
                  >
                    {tbdMerged.map((m) => (
                      <SortableCard key={`${m.kind}-${m.item.id}`} id={`${m.kind}-${m.item.id}`}>
                        <div className="flex items-start gap-1">
                          <GripVertical className="mt-1 size-3 shrink-0 text-muted-foreground/40" />
                          <div className="min-w-0 flex-1">
                            {m.kind === "story"
                              ? <StoryCard story={m.item} showWordCount showPhotoIndicator />
                              : <VideoCard video={m.item as VideoWithRelations} />}
                          </div>
                        </div>
                      </SortableCard>
                    ))}
                  </AgendaDayRow>
                </div>
              )
            })()}
          </div>
        )}

        {/* ── Dated days ── */}
        {currentData.days.map((group) => {
          const isTbd = false
          const label = format(parseISO(group.date), "EEEE, MMMM d")
          const isToday = group.date === today

          const stories = showStories ? group.stories : []
          const videos = showVideos ? group.videos : []

          // Merge stories and videos sorted by onlinePubDate ascending (null at end)
          const merged: Array<
            | { kind: "story"; item: StoryListItem }
            | { kind: "video"; item: VideoWithRelations }
          > = [
            ...stories.map((item) => ({ kind: "story" as const, item })),
            ...videos.map((item) => ({ kind: "video" as const, item })),
          ].sort((a, b) => {
            const ta = a.item.onlinePubDate ? new Date(a.item.onlinePubDate).getTime() : Infinity
            const tb = b.item.onlinePubDate ? new Date(b.item.onlinePubDate).getTime() : Infinity
            return ta - tb
          })

          const itemIds = merged.map((m) => `${m.kind}-${m.item.id}`)
          const count = merged.length

          // For dated days, group items by time bucket and show sub-headers.
          // TBD days render flat (sub-headers would be redundant).
          const bucketGroups = isTbd ? null : TIME_BUCKETS
            .filter((b) => b.id !== "TBD")
            .map((b) => ({
              bucket: b,
              items: merged.filter((m) =>
                m.item.onlinePubDate
                  ? dateToBucket(new Date(m.item.onlinePubDate)) === b.id
                  : false
              ),
            }))
            .filter((bg) => bg.items.length > 0)

          return (
            <AgendaDayRow
              key={group.date}
              dateKey={group.date}
              label={label}
              isToday={isToday}
              itemIds={itemIds}
              count={count}
            >
              {bucketGroups ? (
                <div className="space-y-3">
                  {bucketGroups.map((bg) => (
                    <div key={bg.bucket.id} className="space-y-1.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60 px-1">
                        {BUCKET_NAMES[bg.bucket.id]} · {bg.bucket.label}
                      </p>
                      {bg.items.map((m) => (
                        <SortableCard key={`${m.kind}-${m.item.id}`} id={`${m.kind}-${m.item.id}`}>
                          <div className="flex items-start gap-1">
                            <GripVertical className="mt-1 size-3 shrink-0 text-muted-foreground/40" />
                            <div className="min-w-0 flex-1">
                              {m.kind === "story"
                                ? <StoryCard story={m.item} showWordCount showPhotoIndicator />
                                : <VideoCard video={m.item as VideoWithRelations} />}
                            </div>
                          </div>
                        </SortableCard>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                merged.map((m) => (
                  <SortableCard key={`${m.kind}-${m.item.id}`} id={`${m.kind}-${m.item.id}`}>
                    <div className="flex items-start gap-1">
                      <GripVertical className="mt-1 size-3 shrink-0 text-muted-foreground/40" />
                      <div className="min-w-0 flex-1">
                        {m.kind === "story"
                          ? <StoryCard story={m.item} showWordCount showPhotoIndicator />
                          : <VideoCard video={m.item as VideoWithRelations} />}
                      </div>
                    </div>
                  </SortableCard>
                ))
              )}
            </AgendaDayRow>
          )
        })}
      </div>
    </DndProvider>
  )
}

// ─── Main View ────────────────────────────────────────────────────────────────

export function DailyBudgetView({ date }: DailyBudgetViewProps) {
  const [showStories, setShowStories] = useState(true)
  const [showVideos, setShowVideos] = useState(true)
  const [viewMode, setViewMode] = useState<"columns" | "agenda">("columns")

  let parsedDate: Date
  try { parsedDate = parseISO(date) } catch { parsedDate = new Date() }

  const prevDate = format(subDays(parsedDate, 1), "yyyy-MM-dd")
  const nextDate = format(addDays(parsedDate, 1), "yyyy-MM-dd")
  const displayDate = format(parsedDate, "EEEE, MMMM d, yyyy")
  const isToday = date === format(new Date(), "yyyy-MM-dd")

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

          {/* View mode toggle */}
          <div className="flex divide-x overflow-hidden rounded-md border">
            <Button
              size="sm"
              variant="ghost"
              className={cn("rounded-none gap-1.5 text-xs", viewMode === "columns" && "bg-muted font-medium")}
              onClick={() => setViewMode("columns")}
            >
              <LayoutGrid className="size-3.5" />
              Columns
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className={cn("rounded-none gap-1.5 text-xs", viewMode === "agenda" && "bg-muted font-medium")}
              onClick={() => setViewMode("agenda")}
            >
              <List className="size-3.5" />
              Agenda
            </Button>
          </div>

          {/* New item buttons */}
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

      {/* Content */}
      {viewMode === "columns"
        ? <ColumnsView date={date} showStories={showStories} showVideos={showVideos} />
        : <AgendaView date={date} showStories={showStories} showVideos={showVideos} />
      }
    </div>
  )
}

"use client"

import { useState, useCallback, useEffect } from "react"
import Link from "next/link"
import useSWR from "swr"
import { format, parseISO, addDays, subDays } from "date-fns"
import {
  ChevronLeft, ChevronRight, ChevronDown, Plus,
  Info, FileText, Video, LayoutGrid, List, Sunrise, CheckSquare,
} from "lucide-react"
import { useDroppable, closestCenter } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core"

import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DndProvider } from "@/components/dnd/DndProvider"
import { SortableCard } from "@/components/dnd/SortableCard"
import { StoryCard } from "@/components/budget/StoryCard"
import { VideoCard } from "@/components/budget/VideoCard"
import { TIME_BUCKETS, dateToBucket, todayString, cn, STORY_STATUS_LABELS } from "@/lib/utils"
import { usePreferences } from "@/lib/hooks/usePreferences"
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
  selectMode: boolean
  selectedIds: Set<string>
  onToggleSelect: (compositeId: string) => void
  refreshTrigger: number
}

// ─── Fetcher ──────────────────────────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then((r) => r.json())

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
  children: React.ReactNode
}

function DroppableColumn({
  slotId, label, description, count, itemIds, newStoryHref, newVideoHref, nextMorningDate, children,
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
      {nextMorningDate && <NextMorningDropZone nextDate={nextMorningDate} />}
    </div>
  )
}

// ─── Columns View ─────────────────────────────────────────────────────────────

const BUCKET_IDS = new Set(TIME_BUCKETS.map((b) => b.id))

function ColumnsView({ date, showStories, showVideos, selectMode, selectedIds, onToggleSelect, refreshTrigger }: ContentViewProps) {
  const [activeId, setActiveId] = useState<string | null>(null)

  const { data, isLoading, mutate } = useSWR<DailyBudgetResponse>(
    ["/api/budget/daily", date],
    () => fetcher(`/api/budget/daily?date=${date}`),
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
        const endpoint = isStory ? `/api/stories/${itemId}` : `/api/videos/${itemId}`
        await fetch(endpoint, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchBody),
        })
        if (undoPayload) {
          const frozenUndo = undoPayload
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
            >
              {stories.map((story) => (
                <SortableCard key={`story-${story.id}`} id={`story-${story.id}`} handle disabled={selectMode}>
                  <StoryCard
                    story={story}
                    showWordCount
                    showPhotoIndicator
                    selectMode={selectMode}
                    isSelected={selectedIds.has(`story-${story.id}`)}
                    onToggleSelect={() => onToggleSelect(`story-${story.id}`)}
                  />
                </SortableCard>
              ))}
              {videos.map((video) => (
                <SortableCard key={`video-${video.id}`} id={`video-${video.id}`} handle disabled={selectMode}>
                  <VideoCard
                    video={video}
                    selectMode={selectMode}
                    isSelected={selectedIds.has(`video-${video.id}`)}
                    onToggleSelect={() => onToggleSelect(`video-${video.id}`)}
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

// ─── Droppable Bucket Section (agenda view) ───────────────────────────────────

function DroppableBucketSection({ id, label, children }: {
  id: string
  label: string
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className={cn("space-y-1.5 rounded-md transition-colors", isOver && "bg-primary/5")}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground border-t pt-1.5 mt-0.5 px-1">
        {label}
      </p>
      {children}
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

function AgendaView({ date, showStories, showVideos, selectMode, selectedIds, onToggleSelect, refreshTrigger }: ContentViewProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [tbdExpanded, setTbdExpanded] = useState(false)

  const { data, isLoading, mutate } = useSWR<AgendaResponse>(
    ["/api/budget/agenda", date],
    () => fetcher(`/api/budget/agenda?start=${date}`),
    { refreshInterval: 30_000 }
  )

  const [localData, setLocalData] = useState<AgendaResponse | null>(null)
  const currentData = localData ?? data

  useEffect(() => {
    if (refreshTrigger > 0) mutate()
  }, [refreshTrigger, mutate])

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
      if (!sourceDate || !sourceItem) return

      let targetDate: string = sourceDate
      let targetBucketId: string | null = null

      if (allDateKeys.has(rawTarget)) {
        targetDate = rawTarget
      } else if (rawTarget.includes("::")) {
        const [dateStr, bucketId] = rawTarget.split("::", 2)
        targetDate = dateStr
        targetBucketId = bucketId
      } else {
        for (const group of allGroups) {
          if (
            group.stories.some((s) => `story-${s.id}` === rawTarget) ||
            group.videos.some((v) => `video-${v.id}` === rawTarget)
          ) {
            targetDate = group.date
            if (group.date === sourceDate) {
              const tgt =
                group.stories.find((s) => `story-${s.id}` === rawTarget) ??
                group.videos.find((v) => `video-${v.id}` === rawTarget)
              if (tgt && !tgt.onlinePubDateTBD && tgt.onlinePubDate) {
                targetBucketId = dateToBucket(new Date(tgt.onlinePubDate))
              }
            }
            break
          }
        }
      }

      if (targetDate === sourceDate && !targetBucketId) return
      if (targetDate === sourceDate && targetBucketId) {
        const srcBucket =
          !sourceItem.onlinePubDateTBD && sourceItem.onlinePubDate
            ? dateToBucket(new Date(sourceItem.onlinePubDate))
            : null
        if (srcBucket === targetBucketId) return
      }

      let newPubDate: string | null = null
      let newTBD = false
      if (targetDate === "TBD") {
        newTBD = true
      } else if (targetBucketId) {
        const bucket = TIME_BUCKETS.find((b) => b.id === targetBucketId)
        if (bucket && bucket.defaultHour !== null) {
          const h = String(bucket.defaultHour).padStart(2, "0")
          const m = String(bucket.defaultMinute ?? 0).padStart(2, "0")
          newPubDate = `${targetDate}T${h}:${m}:00.000Z`
        } else {
          newTBD = true
        }
      } else {
        if (!sourceItem.onlinePubDateTBD && sourceItem.onlinePubDate) {
          const existing = new Date(sourceItem.onlinePubDate)
          const h = String(existing.getUTCHours()).padStart(2, "0")
          const m = String(existing.getUTCMinutes()).padStart(2, "0")
          newPubDate = `${targetDate}T${h}:${m}:00.000Z`
        } else {
          newPubDate = `${targetDate}T00:00:00.000Z`
        }
      }

      const updatedItem = {
        ...sourceItem,
        onlinePubDate: newPubDate as unknown as Date | null,
        onlinePubDateTBD: newTBD,
      }
      const drop = <T extends { id: string }>(arr: T[]) => arr.filter((x) => x.id !== itemId)
      const updatedDays = currentData.days.map((day) => ({
        ...day,
        stories: isStory ? drop(day.stories) : day.stories,
        videos: isVideo ? drop(day.videos) : day.videos,
      }))
      const updatedTbd = {
        ...currentData.tbd,
        stories: isStory ? drop(currentData.tbd.stories) : currentData.tbd.stories,
        videos: isVideo ? drop(currentData.tbd.videos) : currentData.tbd.videos,
      }
      if (targetDate === "TBD") {
        if (isStory) updatedTbd.stories.push(updatedItem as StoryListItem)
        else updatedTbd.videos.push(updatedItem as VideoWithRelations)
      } else {
        const idx = updatedDays.findIndex((d) => d.date === targetDate)
        if (idx >= 0) {
          if (isStory) updatedDays[idx].stories.push(updatedItem as StoryListItem)
          else updatedDays[idx].videos.push(updatedItem as VideoWithRelations)
        }
      }
      setLocalData({ ...currentData, days: updatedDays, tbd: updatedTbd })

      try {
        const patchBody: Record<string, unknown> = newTBD
          ? { onlinePubDateTBD: true, onlinePubDate: null }
          : { onlinePubDateTBD: false, onlinePubDate: newPubDate }
        const endpoint = isStory ? `/api/stories/${itemId}` : `/api/videos/${itemId}`
        await fetch(endpoint, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchBody),
        })
      } catch (err) {
        console.error("Failed to update agenda item:", err)
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

  const today = todayString()

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
      collisionDetection={closestCenter}
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
                      <SortableCard key={`${m.kind}-${m.item.id}`} id={`${m.kind}-${m.item.id}`} handle disabled={selectMode}>
                        {m.kind === "story"
                          ? <StoryCard
                              story={m.item}
                              showWordCount
                              showPhotoIndicator
                              budgetLineClamp={3}
                              selectMode={selectMode}
                              isSelected={selectedIds.has(`story-${m.item.id}`)}
                              onToggleSelect={() => onToggleSelect(`story-${m.item.id}`)}
                            />
                          : <VideoCard
                              video={m.item as VideoWithRelations}
                              budgetLineClamp={3}
                              selectMode={selectMode}
                              isSelected={selectedIds.has(`video-${m.item.id}`)}
                              onToggleSelect={() => onToggleSelect(`video-${m.item.id}`)}
                            />}
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
                    <DroppableBucketSection
                      key={bg.bucket.id}
                      id={`${group.date}::${bg.bucket.id}`}
                      label={`${BUCKET_NAMES[bg.bucket.id]} · ${bg.bucket.label}`}
                    >
                      {bg.items.map((m) => (
                        <SortableCard key={`${m.kind}-${m.item.id}`} id={`${m.kind}-${m.item.id}`} handle disabled={selectMode}>
                          {m.kind === "story"
                            ? <StoryCard
                                story={m.item}
                                showWordCount
                                showPhotoIndicator
                                budgetLineClamp={3}
                                selectMode={selectMode}
                                isSelected={selectedIds.has(`story-${m.item.id}`)}
                                onToggleSelect={() => onToggleSelect(`story-${m.item.id}`)}
                              />
                            : <VideoCard
                                video={m.item as VideoWithRelations}
                                budgetLineClamp={3}
                                selectMode={selectMode}
                                isSelected={selectedIds.has(`video-${m.item.id}`)}
                                onToggleSelect={() => onToggleSelect(`video-${m.item.id}`)}
                              />}
                        </SortableCard>
                      ))}
                    </DroppableBucketSection>
                  ))}
                </div>
              ) : (
                merged.map((m) => (
                  <SortableCard key={`${m.kind}-${m.item.id}`} id={`${m.kind}-${m.item.id}`} handle disabled={selectMode}>
                    {m.kind === "story"
                      ? <StoryCard
                          story={m.item}
                          showWordCount
                          showPhotoIndicator
                          budgetLineClamp={3}
                          selectMode={selectMode}
                          isSelected={selectedIds.has(`story-${m.item.id}`)}
                          onToggleSelect={() => onToggleSelect(`story-${m.item.id}`)}
                        />
                      : <VideoCard
                          video={m.item as VideoWithRelations}
                          budgetLineClamp={3}
                          selectMode={selectMode}
                          isSelected={selectedIds.has(`video-${m.item.id}`)}
                          onToggleSelect={() => onToggleSelect(`video-${m.item.id}`)}
                        />}
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
  const { preferences } = usePreferences()
  const [showStories, setShowStories] = useState(() => preferences.contentDefault !== "videos")
  const [showVideos, setShowVideos]   = useState(() => preferences.contentDefault !== "stories")
  const [viewMode, setViewMode] = useState<"columns" | "agenda">(() =>
    preferences.defaultView === "daily-agenda" ? "agenda" : "columns"
  )

  // Bulk select state
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState("")
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

  function toggleSelect(compositeId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(compositeId)) next.delete(compositeId)
      else next.add(compositeId)
      return next
    })
  }

  function exitSelectMode() {
    setSelectMode(false)
    setSelectedIds(new Set())
    setBulkStatus("")
  }

  async function applyBulkStatus() {
    if (!bulkStatus || selectedIds.size === 0) return
    setApplying(true)
    try {
      await Promise.all(
        [...selectedIds].map((compositeId) => {
          const isStory = compositeId.startsWith("story-")
          const id = compositeId.slice(isStory ? "story-".length : "video-".length)
          return fetch(isStory ? `/api/stories/${id}` : `/api/videos/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: bulkStatus }),
          })
        })
      )
      const n = selectedIds.size
      toast.success(`Updated ${n} ${n === 1 ? "item" : "items"}`)
      exitSelectMode()
      setRefreshTrigger((t) => t + 1)
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

          {/* View mode toggle — hidden on mobile (always agenda) */}
          <div className="hidden md:flex divide-x overflow-hidden rounded-md border">
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
          <Button asChild size="sm">
            <Link href="/videos/new">
              <Plus className="size-4" />
              New Video
            </Link>
          </Button>
        </div>
      </div>

      {/* Content */}
      {viewMode === "columns"
        ? <ColumnsView
            date={date}
            showStories={showStories}
            showVideos={showVideos}
            selectMode={selectMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            refreshTrigger={refreshTrigger}
          />
        : <AgendaView
            date={date}
            showStories={showStories}
            showVideos={showVideos}
            selectMode={selectMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            refreshTrigger={refreshTrigger}
          />
      }

      {/* Bulk action bar */}
      {selectMode && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background shadow-lg">
          <div className="mx-auto flex max-w-screen-xl items-center gap-3 px-4 py-3">
            <span className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{selectedIds.size}</span>
              {" "}{selectedIds.size === 1 ? "item" : "items"} selected
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
              disabled={!bulkStatus || selectedIds.size === 0 || applying}
              onClick={applyBulkStatus}
            >
              {applying ? "Applying…" : "Apply"}
            </Button>
            <Button size="sm" variant="ghost" onClick={exitSelectMode}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

"use client"

import { useState, useCallback, useEffect, useMemo } from "react"
import useSWR from "swr"
import { format, parseISO } from "date-fns"
import { ChevronDown } from "lucide-react"
import { useDroppable, closestCenter } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core"

import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { DndProvider } from "@/components/dnd/DndProvider"
import { SortableCard } from "@/components/dnd/SortableCard"
import { StoryCard } from "@/components/budget/StoryCard"
import { VideoCard } from "@/components/budget/VideoCard"
import { TIME_BUCKETS, dateToBucket, todayString, cn } from "@/lib/utils"
import { personIdsQueryParts, excludeReporterIdsQueryParts } from "@/lib/budget-query"
import type { StoryListItem, VideoWithRelations } from "@/types/index"
import type { AgendaDay, AgendaResponse } from "@/app/api/budget/agenda/route"
import { apiPath } from "@/lib/api-path"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgendaViewProps {
  date: string // YYYY-MM-DD, window start
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
  /** SWR cache-key namespace, so a filtered view's cache never collides with the unfiltered one. */
  cacheKeyPrefix?: string
}

// ─── Fetcher ──────────────────────────────────────────────────────────────────

const fetcher = (url: string) => fetch(apiPath(url)).then((r) => r.json())

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

export function AgendaView({
  date, showStories, showVideos, selectMode, selectedIds, onToggleSelect, refreshTrigger,
  personIds, excludeReporterIds, cacheKeyPrefix = "/api/budget/agenda",
}: AgendaViewProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [tbdExpanded, setTbdExpanded] = useState(false)

  const { cacheKey: personIdsKey, querySuffix } = personIdsQueryParts(personIds)
  const { cacheKey: excludeKey, querySuffix: excludeSuffix } = excludeReporterIdsQueryParts(excludeReporterIds)
  const queryUrl = `/api/budget/agenda?start=${date}${querySuffix}${excludeSuffix}`

  const { data, isLoading, mutate } = useSWR<AgendaResponse>(
    [cacheKeyPrefix, date, personIdsKey, excludeKey],
    () => fetcher(queryUrl),
    { refreshInterval: 30_000 }
  )

  const [localData, setLocalData] = useState<AgendaResponse | null>(null)
  const currentData = localData ?? data

  useEffect(() => {
    if (refreshTrigger > 0) mutate()
  }, [refreshTrigger, mutate])

  const safeDays: AgendaDay[] = useMemo(() => currentData?.days ?? [], [currentData])

  const allDateKeys = useMemo(
    () => new Set([...safeDays.map((d) => d.date), "TBD"]),
    [safeDays]
  )

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

      const currentDays: AgendaDay[] = currentData.days ?? []
      const currentTbd: AgendaDay = currentData.tbd ?? { date: "TBD", stories: [], videos: [] }
      const allGroups: AgendaDay[] = [...currentDays, currentTbd]

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
      } else if (!sourceItem.onlinePubDateTBD && sourceItem.onlinePubDate) {
        const existing = new Date(sourceItem.onlinePubDate)
        const h = String(existing.getUTCHours()).padStart(2, "0")
        const m = String(existing.getUTCMinutes()).padStart(2, "0")
        newPubDate = `${targetDate}T${h}:${m}:00.000Z`
      } else {
        newPubDate = `${targetDate}T00:00:00.000Z`
      }

      const updatedItem = {
        ...sourceItem,
        onlinePubDate: newPubDate as unknown as Date | null,
        onlinePubDateTBD: newTBD,
      }

      const drop = <T extends { id: string }>(arr: T[]) => arr.filter((x) => x.id !== itemId)

      const updatedDays = currentDays.map((day) => ({
        ...day,
        stories: isStory ? drop(day.stories) : day.stories,
        videos: isVideo ? drop(day.videos) : day.videos,
      }))

      const updatedTbd: AgendaDay = {
        ...currentTbd,
        stories: isStory ? drop(currentTbd.stories) : currentTbd.stories,
        videos: isVideo ? drop(currentTbd.videos) : currentTbd.videos,
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

        const endpoint = apiPath(isStory ? `/api/stories/${itemId}` : `/api/videos/${itemId}`)

        const res = await fetch(endpoint, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchBody),
        })
        if (!res.ok) {
          throw new Error(`PATCH ${endpoint} failed with ${res.status}`)
        }
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

    const currentDays: AgendaDay[] = currentData.days ?? []
    const currentTbd: AgendaDay = currentData.tbd ?? { date: "TBD", stories: [], videos: [] }
    const allGroups: AgendaDay[] = [...currentDays, currentTbd]

    if (activeId.startsWith("story-")) {
      const id = activeId.slice("story-".length)
      for (const group of allGroups) {
        const story = group.stories.find((s) => s.id === id)
        if (story) return <StoryCard story={story} isDragging showWordCount showPhotoIndicator videoCount={story.videos.length} />
      }
    }

    if (activeId.startsWith("video-")) {
      const id = activeId.slice("video-".length)
      for (const group of allGroups) {
        const video = group.videos.find((v) => v.id === id)
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

  const tbdGroup: AgendaDay = currentData.tbd ?? { date: "TBD", stories: [], videos: [] }
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
                              videoCount={m.item.videos.length}
                              budgetLineClamp={3}
                              selectMode={selectMode}
                              isSelected={selectedIds.has(`story-${m.item.id}`)}
                              onToggleSelect={() => onToggleSelect(`story-${m.item.id}`, m.item.status)}
                            />
                          : <VideoCard
                              video={m.item as VideoWithRelations}
                              budgetLineClamp={3}
                              selectMode={selectMode}
                              isSelected={selectedIds.has(`video-${m.item.id}`)}
                              onToggleSelect={() => onToggleSelect(`video-${m.item.id}`, m.item.status)}
                            />}
                      </SortableCard>
                    ))}
                  </AgendaDayRow>
                </div>
              )
            })()}
          </div>
        )}

        {(currentData.days ?? []).map((group) => {
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

          const bucketGroups = TIME_BUCKETS
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
                              videoCount={m.item.videos.length}
                              budgetLineClamp={3}
                              selectMode={selectMode}
                              isSelected={selectedIds.has(`story-${m.item.id}`)}
                              onToggleSelect={() => onToggleSelect(`story-${m.item.id}`, m.item.status)}
                            />
                          : <VideoCard
                              video={m.item as VideoWithRelations}
                              budgetLineClamp={3}
                              selectMode={selectMode}
                              isSelected={selectedIds.has(`video-${m.item.id}`)}
                              onToggleSelect={() => onToggleSelect(`video-${m.item.id}`, m.item.status)}
                            />}
                      </SortableCard>
                    ))}
                  </DroppableBucketSection>
                ))}
              </div>
            </AgendaDayRow>
          )
        })}
      </div>
    </DndProvider>
  )
}

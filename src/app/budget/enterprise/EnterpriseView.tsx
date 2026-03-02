"use client"

import { useState, useCallback } from "react"
import Link from "next/link"
import useSWR from "swr"
import { format, parseISO, addDays } from "date-fns"
import { Plus, GripVertical, CalendarDays } from "lucide-react"
import { useDroppable } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import type { DragEndEvent } from "@dnd-kit/core"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { DndProvider } from "@/components/dnd/DndProvider"
import { SortableCard } from "@/components/dnd/SortableCard"
import { StoryCard } from "@/components/budget/StoryCard"
import { VideoCard } from "@/components/budget/VideoCard"
import type { EnterpriseDateGroup, StoryWithRelations, VideoWithRelations } from "@/types/index"

// ─── Types ────────────────────────────────────────────────────────────────────

interface EnterpriseResponse {
  groups: EnterpriseDateGroup[]
}

// ─── Fetcher ──────────────────────────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then((r) => r.json())

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatGroupDate(dateStr: string): string {
  if (dateStr === "TBD") return "TBD"
  try {
    const monday = parseISO(dateStr)
    const sunday = addDays(monday, 6)
    if (monday.getMonth() === sunday.getMonth()) {
      return `${format(monday, "MMM d")} – ${format(sunday, "d, yyyy")}`
    }
    return `${format(monday, "MMM d")} – ${format(sunday, "MMM d, yyyy")}`
  } catch {
    return dateStr
  }
}

// ─── Droppable Section ────────────────────────────────────────────────────────

interface DroppableSectionProps {
  groupDate: string
  label: string
  count: number
  itemIds: string[]
  newStoryHref: string
  children: React.ReactNode
}

function DroppableSection({
  groupDate,
  label,
  count,
  itemIds,
  newStoryHref,
  children,
}: DroppableSectionProps) {
  const { setNodeRef, isOver } = useDroppable({ id: groupDate })

  return (
    <section className="space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 text-muted-foreground" />
          <h3 className="font-semibold">{label}</h3>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {count}
          </span>
        </div>
        <Link href={newStoryHref} title="New story for this date" className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
          <Plus className="size-3" />
          New Story
        </Link>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={[
          "flex min-h-[80px] flex-col gap-2 rounded-lg border-2 border-dashed p-3 transition-colors",
          isOver
            ? "border-primary/60 bg-primary/5"
            : "border-border/40 bg-muted/10",
        ].join(" ")}
      >
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {children}
        </SortableContext>

        {count === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">
            Drop stories or videos here
          </p>
        )}
      </div>
    </section>
  )
}

// ─── Active drag overlay ──────────────────────────────────────────────────────

interface ActiveItemOverlayProps {
  activeId: string | null
  groups: EnterpriseDateGroup[]
}

function ActiveItemOverlay({ activeId, groups }: ActiveItemOverlayProps) {
  if (!activeId) return null

  for (const group of groups) {
    if (activeId.startsWith("story-")) {
      const id = activeId.slice("story-".length)
      const story = group.stories.find((s) => s.id === id)
      if (story) return <StoryCard story={story} isDragging hideEnterpriseTag />
    }
    if (activeId.startsWith("video-")) {
      const id = activeId.slice("video-".length)
      const video = group.videos.find((v) => v.id === id)
      if (video) return <VideoCard video={video} isDragging />
    }
  }
  return null
}

// ─── Main View ────────────────────────────────────────────────────────────────

export function EnterpriseView() {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [calendarOpen, setCalendarOpen] = useState(false)

  // SWR fetch
  const { data, isLoading, mutate } = useSWR<EnterpriseResponse>(
    "/api/budget/enterprise",
    fetcher
  )

  // Local state: extra user-added empty date buckets + optimistic moves
  const [localGroups, setLocalGroups] = useState<EnterpriseDateGroup[] | null>(null)

  const groups: EnterpriseDateGroup[] = localGroups ?? data?.groups ?? []

  // The set of known group date keys (for resolving over.id)
  const groupDateSet = new Set(groups.map((g) => g.date))

  // ── Add date handler ───────────────────────────────────────────────────────

  const handleAddDate = useCallback(
    (selected: Date | undefined) => {
      if (!selected) return
      setCalendarOpen(false)

      // Snap to Monday of the selected week
      const day = selected.getDay()
      const monday = new Date(selected)
      monday.setDate(selected.getDate() + (day === 0 ? -6 : 1 - day))
      const dateStr = format(monday, "yyyy-MM-dd")

      // Don't add if already present
      if (groups.some((g) => g.date === dateStr)) return

      // Insert sorted, TBD at end
      const newGroups: EnterpriseDateGroup[] = [
        ...groups,
        { date: dateStr, stories: [], videos: [] },
      ].sort((a, b) => {
        if (a.date === "TBD") return 1
        if (b.date === "TBD") return -1
        return a.date.localeCompare(b.date)
      })

      setLocalGroups(newGroups)
    },
    [groups]
  )

  // ── Drag handlers ──────────────────────────────────────────────────────────

  const handleDragStart = useCallback(
    (event: { active: { id: string | number } }) => {
      setActiveId(String(event.active.id))
    },
    []
  )

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveId(null)
      const { active, over } = event
      if (!over) return

      const activeIdStr = String(active.id)
      const rawTarget = String(over.id)

      const isStory = activeIdStr.startsWith("story-")
      const isVideo = activeIdStr.startsWith("video-")
      if (!isStory && !isVideo) return

      const itemId = isStory
        ? activeIdStr.slice("story-".length)
        : activeIdStr.slice("video-".length)

      // Find source group
      let sourceDate: string | null = null
      for (const g of groups) {
        if (isStory && g.stories.some((x) => x.id === itemId)) {
          sourceDate = g.date
          break
        }
        if (isVideo && g.videos.some((x) => x.id === itemId)) {
          sourceDate = g.date
          break
        }
      }

      // Resolve target: over.id may be a group date OR an item id
      let targetDate = rawTarget
      if (!groupDateSet.has(rawTarget)) {
        // It's probably an item id — find its parent group
        for (const g of groups) {
          if (
            g.stories.some((x) => `story-${x.id}` === rawTarget) ||
            g.videos.some((x) => `video-${x.id}` === rawTarget)
          ) {
            targetDate = g.date
            break
          }
        }
      }

      if (!sourceDate || targetDate === sourceDate) return

      // ── Optimistic update ────────────────────────────────────────────────
      const newGroups: EnterpriseDateGroup[] = groups.map((g) => {
        let stories = [...g.stories]
        let videos = [...g.videos]

        if (g.date === sourceDate) {
          if (isStory) stories = stories.filter((x) => x.id !== itemId)
          else videos = videos.filter((x) => x.id !== itemId)
        }

        return { date: g.date, stories, videos }
      })

      // Ensure target group exists
      let targetGroup = newGroups.find((g) => g.date === targetDate)
      if (!targetGroup) {
        targetGroup = { date: targetDate, stories: [], videos: [] }
        newGroups.push(targetGroup)
        newGroups.sort((a, b) => {
          if (a.date === "TBD") return 1
          if (b.date === "TBD") return -1
          return a.date.localeCompare(b.date)
        })
      }

      const sourceGroup = groups.find((g) => g.date === sourceDate)
      if (sourceGroup) {
        if (isStory) {
          const story = sourceGroup.stories.find((x) => x.id === itemId)
          if (story) {
            const tg = newGroups.find((g) => g.date === targetDate)
            if (tg) tg.stories.push(story)
          }
        } else {
          const video = sourceGroup.videos.find((x) => x.id === itemId)
          if (video) {
            const tg = newGroups.find((g) => g.date === targetDate)
            if (tg) tg.videos.push(video)
          }
        }
      }

      setLocalGroups(newGroups)

      // ── API call ─────────────────────────────────────────────────────────
      try {
        let patchBody: Record<string, unknown>

        if (targetDate === "TBD") {
          patchBody = {
            onlinePubDateTBD: true,
            onlinePubDate: null,
            printPubDateTBD: true,
            printPubDate: null,
          }
        } else {
          // Local midnight so dates group correctly in the user's timezone
          const midnight = new Date(`${targetDate}T00:00:00`)
          patchBody = {
            onlinePubDateTBD: false,
            onlinePubDate: midnight.toISOString(),
            printPubDateTBD: false,
            printPubDate: midnight.toISOString(),
          }
        }

        // Videos don't have printPubDate fields
        if (isVideo) {
          delete patchBody.printPubDate
          delete patchBody.printPubDateTBD
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
        console.error("Failed to update enterprise item date:", err)
      } finally {
        await mutate()
        setLocalGroups(null)
      }
    },
    [groups, groupDateSet, mutate]
  )

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Enterprise Stories &amp; Videos</h2>
        <div className="flex flex-wrap items-center gap-2">
          {/* Add Date button with calendar popover */}
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="size-4" />
                Add Date
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                onSelect={handleAddDate}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          <Button asChild size="sm">
            <Link href="/stories/new?isEnterprise=true">
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
          onDragEnd={handleDragEnd}
          overlayContent={
            <ActiveItemOverlay activeId={activeId} groups={groups} />
          }
        >
          <div className="space-y-8">
            {groups.length === 0 ? (
              <div className="rounded-lg border border-dashed py-16 text-center">
                <p className="text-sm text-muted-foreground">
                  No enterprise content yet.
                </p>
                <div className="mt-4 flex justify-center gap-2">
                  <Button asChild size="sm">
                    <Link href="/stories/new?isEnterprise=true">Add a story</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/videos/new">Add a video</Link>
                  </Button>
                </div>
              </div>
            ) : (
              groups.map((group) => {
                const itemIds = [
                  ...group.stories.map((s) => `story-${s.id}`),
                  ...group.videos.map((v) => `video-${v.id}`),
                ]
                const count = group.stories.length + group.videos.length

                const newStoryHref = (() => {
                  if (group.date === "TBD") {
                    return "/stories/new?isEnterprise=true"
                  }
                  const iso = encodeURIComponent(new Date(`${group.date}T00:00:00`).toISOString())
                  return `/stories/new?isEnterprise=true&onlinePubDate=${iso}&onlinePubDateTBD=false&printPubDate=${iso}&printPubDateTBD=false`
                })()

                return (
                  <DroppableSection
                    key={group.date}
                    groupDate={group.date}
                    label={formatGroupDate(group.date)}
                    count={count}
                    itemIds={itemIds}
                    newStoryHref={newStoryHref}
                  >
                    {group.stories.map((story) => (
                      <SortableCard
                        key={`story-${story.id}`}
                        id={`story-${story.id}`}
                      >
                        <div className="flex items-start gap-1">
                          <GripVertical className="mt-1 size-3 shrink-0 text-muted-foreground/40" />
                          <div className="min-w-0 flex-1">
                            <StoryCard story={story} hideEnterpriseTag />
                          </div>
                        </div>
                      </SortableCard>
                    ))}
                    {group.videos.map((video) => (
                      <SortableCard
                        key={`video-${video.id}`}
                        id={`video-${video.id}`}
                      >
                        <div className="flex items-start gap-1">
                          <GripVertical className="mt-1 size-3 shrink-0 text-muted-foreground/40" />
                          <div className="min-w-0 flex-1">
                            <VideoCard video={video} />
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

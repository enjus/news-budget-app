"use client"

import { useState, useCallback, useMemo } from "react"
import Link from "next/link"
import useSWR from "swr"
import { format, parseISO, addDays } from "date-fns"
import { Plus, CalendarDays, ChevronDown } from "lucide-react"
import { useDroppable } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import type { DragEndEvent } from "@dnd-kit/core"

import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { DndProvider } from "@/components/dnd/DndProvider"
import { SortableCard } from "@/components/dnd/SortableCard"
import { StoryCard } from "@/components/budget/StoryCard"
import { VideoCard } from "@/components/budget/VideoCard"
import { cn } from "@/lib/utils"
import type { EnterpriseDateGroup, VideoWithRelations } from "@/types/index"

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

// Generate Monday date strings for the current week through ~1 year out (53 weeks)
function generateYearOfWeeks(): string[] {
  const today = new Date()
  const day = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() + (day === 0 ? -6 : 1 - day))
  monday.setHours(0, 0, 0, 0)
  return Array.from({ length: 53 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i * 7)
    return format(d, "yyyy-MM-dd")
  })
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
  const [tbdExpanded, setTbdExpanded] = useState(false)
  const [pastExpanded, setPastExpanded] = useState(false)

  // SWR fetch
  const { data, isLoading, mutate } = useSWR<EnterpriseResponse>(
    "/api/budget/enterprise",
    fetcher,
    { refreshInterval: 60_000 }
  )

  // Local state for optimistic DnD moves
  const [localGroups, setLocalGroups] = useState<EnterpriseDateGroup[] | null>(null)

  const groups: EnterpriseDateGroup[] = localGroups ?? data?.groups ?? []

  // Merge API groups with a full year of empty week buckets
  const displayGroups = useMemo(() => {
    const apiGroupMap = new Map(groups.map((g) => [g.date, g]))
    const weeks = generateYearOfWeeks()
    const weekSet = new Set(weeks)
    const result: EnterpriseDateGroup[] = weeks.map(
      (weekDate) => apiGroupMap.get(weekDate) ?? { date: weekDate, stories: [], videos: [] }
    )
    // Insert any dated groups from the API that fall outside the generated year
    for (const g of groups) {
      if (g.date !== "TBD" && !weekSet.has(g.date)) result.push(g)
    }
    result.sort((a, b) => a.date.localeCompare(b.date))
    // TBD always last, only if it has content
    const tbd = apiGroupMap.get("TBD")
    if (tbd && (tbd.stories.length > 0 || tbd.videos.length > 0)) result.push(tbd)
    return result
  }, [groups])

  // The set of known group date keys (for resolving over.id)
  const groupDateSet = new Set(displayGroups.map((g) => g.date))

  // Split display groups into past (collapsed) and upcoming (main list).
  // currentMondayStr is generateYearOfWeeks()[0] — the first generated week.
  const currentMondayStr = generateYearOfWeeks()[0]
  const fourWeeksAgoStr = format(addDays(new Date(`${currentMondayStr}T00:00:00`), -28), "yyyy-MM-dd")

  // Past: has content, within the 4-week lookback window, before this week
  const pastGroups = displayGroups.filter(
    (g) => g.date !== "TBD" && g.date < currentMondayStr && g.date >= fourWeeksAgoStr &&
      (g.stories.length > 0 || g.videos.length > 0)
  )
  // TBD group (rendered separately at the top, collapsed)
  const tbdGroup = displayGroups.find((g) => g.date === "TBD") ?? null
  const tbdCount = tbdGroup ? tbdGroup.stories.length + tbdGroup.videos.length : 0

  // Upcoming: current week onward, TBD excluded (handled above)
  const upcomingGroups = displayGroups.filter(
    (g) => g.date !== "TBD" && g.date >= currentMondayStr
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
        setLocalGroups(null)
        toast.error("Couldn't save — change reverted.")
      } finally {
        await mutate()
        setLocalGroups(null)
      }
    },
    [groups, groupDateSet, mutate]
  )

  function renderGroup(group: EnterpriseDateGroup) {
    const itemIds = [
      ...group.stories.map((s) => `story-${s.id}`),
      ...group.videos.map((v) => `video-${v.id}`),
    ]
    const count = group.stories.length + group.videos.length
    const newStoryHref = group.date === "TBD"
      ? "/stories/new?isEnterprise=true"
      : `/stories/new?isEnterprise=true&onlinePubDate=${encodeURIComponent(new Date(`${group.date}T00:00:00`).toISOString())}&onlinePubDateTBD=false&printPubDate=${encodeURIComponent(new Date(`${group.date}T00:00:00`).toISOString())}&printPubDateTBD=false`

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
          <SortableCard key={`story-${story.id}`} id={`story-${story.id}`} handle>
            <StoryCard story={story} hideEnterpriseTag showPhotoIndicator showWordCount videoCount={story.videos.length} budgetLineClamp={3} />
          </SortableCard>
        ))}
        {group.videos.map((video) => (
          <SortableCard key={`video-${video.id}`} id={`video-${video.id}`} handle>
            <VideoCard video={video} budgetLineClamp={3} />
          </SortableCard>
        ))}
      </DroppableSection>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Enterprise Stories &amp; Videos</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm">
            <Link href="/stories/new?isEnterprise=true">
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
                {tbdExpanded && tbdGroup && (
                  <div className="border-l-2 border-border/40 pl-6">
                    {renderGroup(tbdGroup)}
                  </div>
                )}
              </div>
            )}

            {/* ── Past weeks (collapsible) ── */}
            {pastGroups.length > 0 && (
              <div className="space-y-4">
                <button
                  onClick={() => setPastExpanded((v) => !v)}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  <ChevronDown className={cn("size-4 transition-transform", pastExpanded && "rotate-180")} />
                  <span className="font-medium">Past weeks</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                    {pastGroups.reduce((n, g) => n + g.stories.length + g.videos.length, 0)} items
                  </span>
                </button>

                {pastExpanded && (
                  <div className="space-y-8 border-l-2 border-border/40 pl-6">
                    {pastGroups.map((group) => renderGroup(group))}
                  </div>
                )}
              </div>
            )}

            {/* ── Current week + future ── */}
            {upcomingGroups.map((group) => renderGroup(group))}
          </div>
        </DndProvider>
      )}
    </div>
  )
}

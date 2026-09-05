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
import { cn, bucketToUtcStamp } from "@/lib/utils"
import type { EnterpriseDateGroup, EnterpriseStoryItem } from "@/types/index"
import { apiPath } from "@/lib/api-path"
import { VIDEOS_ENABLED } from "@/lib/features"

// ─── Types ────────────────────────────────────────────────────────────────────

interface EnterpriseResponse {
  groups: EnterpriseDateGroup[]
}

// ─── Fetcher ──────────────────────────────────────────────────────────────────

const fetcher = (url: string) => fetch(apiPath(url)).then((r) => r.json())

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
          <span className="rounded-full bg-muted px-2.5 py-1 text-sm font-medium text-foreground/70">
            {count}
          </span>
        </div>
        <Link href={newStoryHref} title="New story for this date" className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm text-foreground/70 hover:bg-muted hover:text-foreground">
          <Plus className="size-3.5" />
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
          <p className="py-4 text-center text-sm text-foreground/70">
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
      if (story) return <StoryCard story={story} isDragging hideEnterpriseTag showOnlinePubDate size="lg" />
    }
    if (VIDEOS_ENABLED && activeId.startsWith("video-")) {
      const id = activeId.slice("video-".length)
      const video = group.videos.find((v) => v.id === id)
      if (video) return <VideoCard video={video} isDragging showOnlinePubDate size="lg" />
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

  const groups: EnterpriseDateGroup[] = useMemo(
    () => localGroups ?? data?.groups ?? [],
    [localGroups, data?.groups]
  )

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
  const groupDateSet = useMemo(() => new Set(displayGroups.map((g) => g.date)), [displayGroups])

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
      let draggedStory: EnterpriseStoryItem | undefined
      if (sourceGroup) {
        if (isStory) {
          const story = sourceGroup.stories.find((x) => x.id === itemId)
          if (story) {
            draggedStory = story
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
          // Plausible default time (Morning), encoded directly as UTC per this
          // app's "newsroom time encoded as UTC" convention — no timezone math,
          // so the calendar day is always exactly `targetDate` regardless of the
          // browser's local timezone.
          const stamp = bucketToUtcStamp(targetDate, "MORNING")!
          patchBody = {
            onlinePubDateTBD: false,
            onlinePubDate: stamp,
          }
          // Deliberately not touching printPubDate/printPubDateTBD here — see #61.
          // Pinning print date to match the dragged-to week used to silently
          // override this item's Enterprise Budget placement (getDateBucket()
          // uses the earliest of online/print date) the next time someone edited
          // the online date, since non-leadership editors can't see/fix print
          // date. Leave any existing print-date override alone; it stays TBD by
          // default for everyone else.
          //
          // If the item already carries an independent print-date override, the
          // server will still bucket it by whichever of online/print is
          // earliest, so this drop can revert once mutate() refetches. Warn
          // instead of letting that happen silently.
          if (draggedStory && !draggedStory.printPubDateTBD && draggedStory.printPubDate) {
            toast.warning("This story has a print date override, so it may snap back — a director needs to update its print date to move it.")
          }
        }

        // Videos don't have printPubDate fields
        if (isVideo) {
          delete patchBody.printPubDate
          delete patchBody.printPubDateTBD
        }

        const endpoint = isStory
          ? apiPath(`/api/stories/${itemId}`)
          : apiPath(`/api/videos/${itemId}`)

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
    const defaultPubDateStr = group.date === "TBD"
      ? null
      : format(addDays(parseISO(group.date), 2), "yyyy-MM-dd") // default new stories to Wednesday of the week
    // Print pub date is deliberately left unset here — see #61. Pre-pinning it
    // to match the default online date locked in an Enterprise Budget
    // placement that non-leadership editors couldn't see or fix if the online
    // date changed later. It stays TBD by default (StoryForm's default) unless
    // a director sets an explicit override.
    const newStoryHref = defaultPubDateStr === null
      ? "/stories/new?isEnterprise=true"
      : `/stories/new?isEnterprise=true&onlinePubDate=${encodeURIComponent(new Date(`${defaultPubDateStr}T00:00:00`).toISOString())}&onlinePubDateTBD=false`

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
            <StoryCard story={story} hideEnterpriseTag showPhotoIndicator showWordCount showOnlinePubDate videoCount={story.videos.length} budgetLineClamp={3} size="lg" />
          </SortableCard>
        ))}
        {VIDEOS_ENABLED && group.videos.map((video) => (
          <SortableCard key={`video-${video.id}`} id={`video-${video.id}`} handle>
            <VideoCard video={video} showOnlinePubDate budgetLineClamp={3} size="lg" />
          </SortableCard>
        ))}
      </DroppableSection>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{VIDEOS_ENABLED ? "Enterprise Stories & Videos" : "Enterprise Stories"}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm">
            <Link href="/stories/new?isEnterprise=true">
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
          onDragStart={handleDragStart}
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
                  className="flex items-center gap-2.5 text-base text-foreground/70 hover:text-foreground"
                >
                  <ChevronDown className={cn("size-5 transition-transform", tbdExpanded && "rotate-180")} />
                  <span className="font-medium">TBD — No scheduled date</span>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-sm font-medium">
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
                  className="flex items-center gap-2.5 text-base text-foreground/70 hover:text-foreground"
                >
                  <ChevronDown className={cn("size-5 transition-transform", pastExpanded && "rotate-180")} />
                  <span className="font-medium">Past weeks</span>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-sm font-medium">
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

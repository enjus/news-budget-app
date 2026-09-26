"use client"

import { useState } from "react"
import useSWR from "swr"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { CollapsibleSection, EmptySection } from "@/components/CollapsibleSection"
import { StoryCard } from "@/components/budget/StoryCard"
import { TagChip } from "@/components/tags/TagChip"
import { itemDateStr, todayString } from "@/lib/utils"
import type { TagRecord } from "@/lib/hooks/useTags"
import type { StoryListItem } from "@/types/index"

interface TagStoriesResponse {
  tag: TagRecord
  stories: StoryListItem[]
  pastDays: number
}

// Pub dates arrive as ISO strings over JSON even though StoryListItem types them as Date.
function dateStr(story: StoryListItem): string | null {
  return itemDateStr({
    onlinePubDate: story.onlinePubDate as unknown as string | null,
    onlinePubDateTBD: story.onlinePubDateTBD,
  })
}

const byTime = (a: StoryListItem, b: StoryListItem) =>
  new Date(a.onlinePubDate!).getTime() - new Date(b.onlinePubDate!).getTime()

export function TagView({ tagKey }: { tagKey: string }) {
  const [openTbd, setOpenTbd] = useState(true)
  const [openUpcoming, setOpenUpcoming] = useState(true)
  const [openPast, setOpenPast] = useState(true)

  const { data, error, isLoading } = useSWR<TagStoriesResponse>(`/api/tags/${tagKey}/stories`)

  if (error) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        {error.message?.includes("404") ? "No such tag." : "Failed to load tagged stories."}
      </div>
    )
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  const { tag, stories, pastDays } = data
  const today = todayString()
  const tbd: StoryListItem[] = []
  const upcoming: StoryListItem[] = []
  const past: StoryListItem[] = []
  for (const s of stories) {
    const ds = dateStr(s)
    if (ds === null) tbd.push(s)
    else if (ds >= today) upcoming.push(s)
    else past.push(s)
  }
  tbd.sort((a, b) => a.slug.localeCompare(b.slug))
  upcoming.sort(byTime)
  past.sort((a, b) => byTime(b, a))

  const renderList = (items: StoryListItem[]) =>
    items.length === 0 ? (
      <EmptySection />
    ) : (
      <div className="space-y-2">
        {items.map((s) => (
          <StoryCard key={s.id} story={s} showOnlinePubDate showPhotoIndicator />
        ))}
      </div>
    )

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <TagChip tagKey={tag.key} tag={tag} text="label" className="px-2 py-1 text-sm" iconClassName="size-4" />
          {tag.archivedAt && (
            <Badge variant="outline" className="text-muted-foreground">Archived</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Budgeted stories tagged {tag.label}: TBD, upcoming, and the past {pastDays} days.
        </p>
      </div>

      <div className="space-y-4">
        <CollapsibleSection title="TBD" count={tbd.length} open={openTbd} onToggle={() => setOpenTbd((v) => !v)}>
          {renderList(tbd)}
        </CollapsibleSection>
        <CollapsibleSection title="Upcoming" count={upcoming.length} open={openUpcoming} onToggle={() => setOpenUpcoming((v) => !v)}>
          {renderList(upcoming)}
        </CollapsibleSection>
        <CollapsibleSection title={`Past ${pastDays} days`} count={past.length} open={openPast} onToggle={() => setOpenPast((v) => !v)}>
          {renderList(past)}
        </CollapsibleSection>
      </div>
    </div>
  )
}

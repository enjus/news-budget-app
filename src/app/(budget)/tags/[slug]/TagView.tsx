"use client"

import { useState } from "react"
import useSWR from "swr"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { CollapsibleSection, EmptySection } from "@/components/CollapsibleSection"
import { StoryCard } from "@/components/budget/StoryCard"
import { TagChip } from "@/components/tags/TagChip"
import { classifyContentItems, todayString } from "@/lib/utils"
import type { TagRecord } from "@/lib/hooks/useTags"
import type { StoryListItem } from "@/types/index"

interface TagStoriesResponse {
  tag: TagRecord
  stories: StoryListItem[]
  pastDays: number
  /** The next-wider window the server will serve, or null at the widest. */
  nextDays: number | null
}

function windowLabel(days: number) {
  if (days >= 365) {
    const years = Math.round(days / 365)
    return years === 1 ? "year" : `${years} years`
  }
  return `${days} days`
}

export function TagView({ tagKey }: { tagKey: string }) {
  const [openTbd, setOpenTbd] = useState(true)
  const [openUpcoming, setOpenUpcoming] = useState(true)
  const [openPast, setOpenPast] = useState(true)

  // null = the server's default window.
  const [days, setDays] = useState<number | null>(null)

  // keepPreviousData: widening the window shouldn't flash the skeleton.
  const { data, error, isLoading, isValidating, mutate } = useSWR<TagStoriesResponse>(
    `/api/tags/${tagKey}/stories${days ? `?days=${days}` : ""}`,
    { keepPreviousData: true },
  )

  // Only a full-page error when there's nothing to show; a failed "Show older"
  // keeps the list and reports inline next to the button.
  if (error && !data) {
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

  const { tag, stories, pastDays, nextDays } = data
  const loadingOlder = isValidating && days !== null && days !== pastDays
  const { tbd, upcoming, past } = classifyContentItems(stories, todayString())

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
          Budgeted stories tagged {tag.label}: TBD, upcoming, and the past {windowLabel(pastDays)}.
        </p>
      </div>

      <div className="space-y-4">
        <CollapsibleSection title="TBD" count={tbd.length} open={openTbd} onToggle={() => setOpenTbd((v) => !v)}>
          {renderList(tbd)}
        </CollapsibleSection>
        <CollapsibleSection title="Upcoming" count={upcoming.length} open={openUpcoming} onToggle={() => setOpenUpcoming((v) => !v)}>
          {renderList(upcoming)}
        </CollapsibleSection>
        <CollapsibleSection title={`Past ${windowLabel(pastDays)}`} count={past.length} open={openPast} onToggle={() => setOpenPast((v) => !v)}>
          {renderList(past)}
          {nextDays !== null && (
            <div className="mt-3 flex items-center gap-3 text-sm">
              <button
                type="button"
                disabled={loadingOlder}
                onClick={() => (error ? mutate() : setDays(nextDays))}
                className="text-primary hover:underline disabled:opacity-50 disabled:no-underline"
              >
                {loadingOlder ? "Loading…" : error ? "Retry" : "Show older"}
              </button>
              {error && !loadingOlder && (
                <span className="text-muted-foreground">Couldn&apos;t load older stories.</span>
              )}
            </div>
          )}
        </CollapsibleSection>
      </div>
    </div>
  )
}

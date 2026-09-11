"use client"

import { useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import useSWR from "swr"
import { FileText, Video, Send, Info, ArrowRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useDrafts } from "@/lib/hooks/useDrafts"
import { usePitches } from "@/lib/hooks/usePitches"
import { PitchRow } from "@/components/budget/PitchRow"
import { DeleteDraftDialog } from "@/components/story/DeleteDraftDialog"
import { CollapsibleSection, EmptySection } from "@/components/CollapsibleSection"
import { ContentRow } from "@/components/budget/ContentItemRow"
import {
  STORY_STATUS_LABELS,
  canCreateContent,
  canViewPeople,
  classifyContentItems,
  formatItemDate,
  todayString,
} from "@/lib/utils"
import type { PersonContentItem } from "@/app/api/people/[id]/content/route"
import { toast } from "sonner"
import { apiPath } from "@/lib/api-path"
import { VIDEOS_ENABLED } from "@/lib/features"

export function MeView() {
  const { data: session } = useSession()
  const appRole = session?.user?.appRole ?? ""
  const canCreate = canCreateContent(appRole)
  const myPersonId = session?.user?.personId

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-8">
      <h1 className="text-xl font-semibold">Me</h1>

      {canCreate && <DraftsSection />}

      {canCreate && <MyPitchesSections />}

      {myPersonId && <AssignedContentSection personId={myPersonId} />}

      {!canCreate && !myPersonId && (
        <div className="rounded-lg border bg-card p-12 text-center">
          <p className="text-sm text-muted-foreground">
            Nothing to show yet.
          </p>
        </div>
      )}
    </div>
  )
}

function DraftsSection() {
  const { stories, videos, isLoading, mutate } = useDrafts()
  const [publishing, setPublishing] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState<Set<string>>(new Set())

  async function handlePublish(type: "story" | "video", id: string) {
    setPublishing((prev) => new Set(prev).add(id))
    try {
      const endpoint = type === "story"
        ? apiPath(`/api/stories/${id}/publish`)
        : apiPath(`/api/videos/${id}/publish`)
      const res = await fetch(endpoint, { method: "POST" })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error ?? "Failed to send to budget")
        return
      }
      toast.success("Sent to budget")
      mutate()
    } catch {
      toast.error("Failed to send to budget")
    } finally {
      setPublishing((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  async function handleDelete(type: "story" | "video", id: string) {
    setDeleting((prev) => new Set(prev).add(id))
    try {
      const endpoint = type === "story"
        ? apiPath(`/api/stories/${id}`)
        : apiPath(`/api/videos/${id}`)
      const res = await fetch(endpoint, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete")
      toast.success(`${type === "story" ? "Story" : "Video"} deleted`)
      mutate()
    } catch {
      toast.error("Failed to delete. Please try again.")
    } finally {
      setDeleting((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">My Drafts</h2>
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    )
  }

  const isEmpty = stories.length === 0 && (!VIDEOS_ENABLED || videos.length === 0)

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground">My Drafts</h2>

      {!isEmpty && (
        <div className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>Drafts aren&rsquo;t sent to the budget until you (or a teammate) send them — they&rsquo;re visible to anyone who navigates to them, so treat this as a personal staging list, not a private one.</span>
        </div>
      )}

      {isEmpty ? (
        <div className="rounded-lg border border-dashed bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No drafts. Use &ldquo;Save as Draft&rdquo; when creating a story or video to stage it here first.
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {stories.map((story) => (
            <DraftRow
              key={`story-${story.id}`}
              type="story"
              id={story.id}
              slug={story.slug}
              budgetLine={story.budgetLine}
              status={story.status}
              date={story.onlinePubDate ? String(story.onlinePubDate) : null}
              dateTBD={story.onlinePubDateTBD}
              isPublishing={publishing.has(story.id)}
              onPublish={() => handlePublish("story", story.id)}
              isDeleting={deleting.has(story.id)}
              onDelete={() => handleDelete("story", story.id)}
            />
          ))}
          {VIDEOS_ENABLED && videos.map((video) => (
            <DraftRow
              key={`video-${video.id}`}
              type="video"
              id={video.id}
              slug={video.slug}
              budgetLine={video.budgetLine}
              status={video.status}
              date={video.onlinePubDate ? String(video.onlinePubDate) : null}
              dateTBD={video.onlinePubDateTBD}
              isPublishing={publishing.has(video.id)}
              onPublish={() => handlePublish("video", video.id)}
              isDeleting={deleting.has(video.id)}
              onDelete={() => handleDelete("video", video.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function DraftRow({
  type,
  id,
  slug,
  budgetLine,
  status,
  date,
  dateTBD,
  isPublishing,
  onPublish,
  isDeleting,
  onDelete,
}: {
  type: "story" | "video"
  id: string
  slug: string
  budgetLine: string
  status: string
  date: string | null
  dateTBD: boolean
  isPublishing: boolean
  onPublish: () => void
  isDeleting: boolean
  onDelete: () => void
}) {
  const href = type === "story" ? `/stories/${id}` : `/videos/${id}`
  const Icon = type === "story" ? FileText : Video

  return (
    <div className="flex items-start gap-3 rounded-lg border border-dashed px-3 py-2.5">
      <Link
        href={href}
        className="flex min-w-0 flex-1 items-start gap-3 hover:underline"
      >
        <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{slug}</span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-dashed">
              Draft
            </Badge>
            {status !== "DRAFT" && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {STORY_STATUS_LABELS[status] ?? status}
              </Badge>
            )}
          </div>
          {budgetLine && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{budgetLine}</p>
          )}
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatItemDate({ onlinePubDate: date, onlinePubDateTBD: dateTBD })}
        </span>
      </Link>

      <Button
        variant="outline"
        size="sm"
        className="shrink-0 h-7 text-xs gap-1"
        disabled={isPublishing}
        onClick={(e) => {
          e.preventDefault()
          onPublish()
        }}
      >
        <Send className="size-3" />
        {isPublishing ? "Sending..." : "Send to Budget"}
      </Button>

      <DeleteDraftDialog slug={slug} disabled={isDeleting} onDelete={onDelete} compact />
    </div>
  )
}

function MyPitchesSections() {
  const { data: session } = useSession()
  const currentUserId = session?.user?.id
  const myPersonId = session?.user?.personId
  const { pitches, isLoading, mutate } = usePitches()

  if (isLoading) {
    return (
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">My Pitches</h2>
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    )
  }

  const myPitches = pitches.filter((p) => p.createdByUser?.id === currentUserId)
  const myClaimed = pitches.filter((p) => myPersonId && p.assignments.some((a) => a.personId === myPersonId))

  if (myPitches.length === 0 && myClaimed.length === 0) return null

  return (
    <div className="space-y-6">
      {myPitches.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">
            My Pitches <span className="ml-1 text-xs font-normal">({myPitches.length})</span>
          </h2>
          <div className="space-y-1">
            {myPitches.map((pitch) => (
              <PitchRow key={pitch.id} pitch={pitch} onUpdate={mutate} />
            ))}
          </div>
        </div>
      )}

      {myClaimed.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">
            My Claimed Pitches <span className="ml-1 text-xs font-normal">({myClaimed.length})</span>
          </h2>
          <div className="space-y-1">
            {myClaimed.map((pitch) => (
              <PitchRow key={pitch.id} pitch={pitch} onUpdate={mutate} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function AssignedContentSection({ personId }: { personId: string }) {
  const { data: session } = useSession()
  const canLinkToProfile = canViewPeople(session?.user?.appRole ?? "")

  const { data, isLoading } = useSWR<{
    person: { id: string; name: string }
    items: PersonContentItem[]
    pastTruncated?: boolean
  }>(`/api/people/${personId}/content?cap=1`)

  // TBD is collapsed by default here (unlike /people/[id]) — on your own
  // page, what's actively coming up matters more than the unscheduled backlog.
  const [openTbd, setOpenTbd] = useState(false)
  const [openUpcoming, setOpenUpcoming] = useState(true)
  const [openPast, setOpenPast] = useState(true)

  if (isLoading) {
    return (
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">My Assigned Content</h2>
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    )
  }

  // Exclude drafts here — they already have their own "My Drafts" section
  // above (with publish/delete actions); showing them again here would just
  // duplicate that list. /api/people/[id]/content itself no longer filters
  // onBudget, since /people/[id] and the Teams member view do want drafts.
  const items = (data?.items ?? []).filter((i) => (VIDEOS_ENABLED || i.type !== "video") && i.onBudget)

  if (items.length === 0) {
    return (
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">My Assigned Content</h2>
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">No content assigned to you.</p>
        </div>
      </div>
    )
  }

  const { tbd, upcoming, past } = classifyContentItems(items, todayString())

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-foreground">My Assigned Content</h2>

      <CollapsibleSection title="TBD" count={tbd.length} open={openTbd} onToggle={() => setOpenTbd((v) => !v)}>
        {tbd.length === 0 ? (
          <EmptySection />
        ) : (
          <div className="space-y-1">
            {tbd.map((item) => (
              <ContentRow key={`${item.type}-${item.id}-${item.role}`} item={item} />
            ))}
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="Upcoming"
        count={upcoming.length}
        open={openUpcoming}
        onToggle={() => setOpenUpcoming((v) => !v)}
      >
        {upcoming.length === 0 ? (
          <EmptySection />
        ) : (
          <div className="space-y-1">
            {upcoming.map((item) => (
              <ContentRow key={`${item.type}-${item.id}-${item.role}`} item={item} highlightToday />
            ))}
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="Past"
        count={past.length}
        truncated={data?.pastTruncated}
        open={openPast}
        onToggle={() => setOpenPast((v) => !v)}
      >
        {past.length === 0 ? (
          <EmptySection />
        ) : (
          <div className="space-y-1">
            {past.map((item) => (
              <ContentRow key={`${item.type}-${item.id}-${item.role}`} item={item} />
            ))}
            {data?.pastTruncated && canLinkToProfile && (
              <Link
                href={`/people/${personId}`}
                className="flex items-center gap-1 pt-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                View full history
                <ArrowRight className="size-3" />
              </Link>
            )}
          </div>
        )}
      </CollapsibleSection>
    </div>
  )
}

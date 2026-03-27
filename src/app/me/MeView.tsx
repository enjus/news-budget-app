"use client"

import { useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import useSWR from "swr"
import { format } from "date-fns"
import { FileText, Video, Send, Info } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useDrafts } from "@/lib/hooks/useDrafts"
import { STORY_STATUS_LABELS, PERSON_ROLE_LABELS, canCreateContent } from "@/lib/utils"
import type { PersonContentItem } from "@/app/api/people/[id]/content/route"
import type { StoryListItem, VideoWithRelations } from "@/types"
import { toast } from "sonner"

function formatItemDate(date: string | null | undefined, tbd: boolean): string {
  if (tbd || !date) return "TBD"
  const d = new Date(date)
  const fakeLocal = new Date(
    d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(),
    d.getUTCHours(), d.getUTCMinutes()
  )
  return format(fakeLocal, "MMM d, yyyy · h:mm a")
}

export function MeView() {
  const { data: session } = useSession()
  const appRole = session?.user?.appRole ?? ""
  const canCreate = canCreateContent(appRole)
  const myPersonId = session?.user?.personId

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-8">
      <h1 className="text-xl font-semibold">Me</h1>

      {canCreate && <DraftsSection />}

      {myPersonId && <MyContentSection personId={myPersonId} />}

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

  async function handlePublish(type: "story" | "video", id: string) {
    setPublishing((prev) => new Set(prev).add(id))
    try {
      const endpoint = type === "story"
        ? `/api/stories/${id}/publish`
        : `/api/videos/${id}/publish`
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

  if (isLoading) {
    return (
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">My Drafts</h2>
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    )
  }

  const isEmpty = stories.length === 0 && videos.length === 0

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">My Drafts</h2>

      {!isEmpty && (
        <div className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>Drafts are private to you until sent to budget. Assigned people won&apos;t see them.</span>
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
            />
          ))}
          {videos.map((video) => (
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
            <span className="text-sm font-medium">{slug}</span>
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
          {formatItemDate(date, dateTBD)}
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
    </div>
  )
}

function MyContentSection({ personId }: { personId: string }) {
  const { data, isLoading } = useSWR<{ person: { id: string; name: string }; items: PersonContentItem[] }>(
    `/api/people/${personId}/content`
  )

  if (isLoading) {
    return (
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">My Assigned Content</h2>
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    )
  }

  const items = data?.items ?? []

  if (items.length === 0) {
    return (
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">My Assigned Content</h2>
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">No content assigned to you.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">
        My Assigned Content
        <span className="ml-2 text-xs font-normal">({items.length})</span>
      </h2>
      <div className="space-y-1">
        {items.map((item) => (
          <AssignedContentRow key={`${item.type}-${item.id}-${item.role}`} item={item} />
        ))}
      </div>
    </div>
  )
}

function AssignedContentRow({ item }: { item: PersonContentItem }) {
  const href = item.type === "story" ? `/stories/${item.id}` : `/videos/${item.id}`
  const Icon = item.type === "story" ? FileText : Video

  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-md px-3 py-2 text-sm hover:bg-accent/50 transition-colors"
    >
      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{item.slug}</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {PERSON_ROLE_LABELS[item.role] ?? item.role}
          </Badge>
          {item.status === "DRAFT" ? (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
              Unpublished
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {STORY_STATUS_LABELS[item.status] ?? item.status}
            </Badge>
          )}
        </div>
        {item.budgetLine && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.budgetLine}</p>
        )}
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">
        {formatItemDate(item.onlinePubDate, item.onlinePubDateTBD)}
      </span>
    </Link>
  )
}

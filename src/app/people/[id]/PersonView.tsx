"use client"

import Link from "next/link"
import useSWR from "swr"
import { format } from "date-fns"
import { ArrowLeft, FileText, Video } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { PERSON_ROLE_LABELS, STORY_STATUS_LABELS } from "@/lib/utils"
import type { PersonContentItem } from "@/app/api/people/[id]/content/route"

interface PersonViewProps {
  id: string
}

interface PersonData {
  person: { id: string; name: string; email: string; defaultRole: string }
  items: PersonContentItem[]
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function formatDate(item: PersonContentItem): string {
  if (item.onlinePubDateTBD || !item.onlinePubDate) return "TBD"
  return format(new Date(item.onlinePubDate), "MMM d, yyyy h:mm a")
}

export function PersonView({ id }: PersonViewProps) {
  const { data, isLoading } = useSWR<PersonData>(
    `/api/people/${id}/content`,
    fetcher
  )

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-32" />
        <div className="mt-8 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  const { person, items } = data

  const stories = items.filter((i) => i.type === "story")
  const videos = items.filter((i) => i.type === "video")

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/people"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        People
      </Link>

      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{person.name}</h1>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{person.email}</span>
          <span>·</span>
          <span>{PERSON_ROLE_LABELS[person.defaultRole] ?? person.defaultRole}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-6 text-sm">
        <div>
          <span className="text-2xl font-semibold">{stories.length}</span>
          <span className="ml-1 text-muted-foreground">
            {stories.length === 1 ? "story" : "stories"}
          </span>
        </div>
        <div>
          <span className="text-2xl font-semibold">{videos.length}</span>
          <span className="ml-1 text-muted-foreground">
            {videos.length === 1 ? "video" : "videos"}
          </span>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No active assignments — TBD, upcoming, or within the past 7 days.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {stories.length > 0 && (
            <section className="space-y-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                <FileText className="size-4" />
                Stories
              </h2>
              <div className="space-y-1">
                {stories.map((item) => (
                  <ContentRow key={`story-${item.id}`} item={item} />
                ))}
              </div>
            </section>
          )}

          {videos.length > 0 && (
            <section className="space-y-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                <Video className="size-4" />
                Videos
              </h2>
              <div className="space-y-1">
                {videos.map((item) => (
                  <ContentRow key={`video-${item.id}`} item={item} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Showing TBD, upcoming, and content from the past 7 days.
      </p>
    </div>
  )
}

function ContentRow({ item }: { item: PersonContentItem }) {
  const href = item.type === "story" ? `/stories/${item.id}` : `/videos/${item.id}`

  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-lg border bg-card px-4 py-3 text-sm hover:bg-accent/50 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{item.slug}</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {PERSON_ROLE_LABELS[item.role] ?? item.role}
          </Badge>
          {item.status !== "DRAFT" && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {STORY_STATUS_LABELS[item.status] ?? item.status}
            </Badge>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.budgetLine}</p>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">
        {item.onlinePubDateTBD || !item.onlinePubDate
          ? "TBD"
          : format(new Date(item.onlinePubDate), "MMM d, h:mm a")}
      </span>
    </Link>
  )
}

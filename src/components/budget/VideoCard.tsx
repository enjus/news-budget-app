"use client"

import Link from "next/link"
import { Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn, initials, formatTime } from "@/lib/utils"
import type { VideoWithRelations } from "@/types/index"

interface VideoCardProps {
  video: VideoWithRelations
  isDragging?: boolean
}

const STATUS_BORDER: Record<string, string> = {
  PUBLISHED_FINAL: "border-l-4 border-l-emerald-500",
  SHELVED:         "border-l-4 border-l-red-400",
}

function VideoStatusChip({ video }: { video: VideoWithRelations }) {
  const time = !video.onlinePubDateTBD && video.onlinePubDate
    ? formatTime(video.onlinePubDate)
    : null

  switch (video.status) {
    case "PUBLISHED_FINAL":
      return (
        <span className="shrink-0 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
          {time ? `✓ ${time}` : "✓ Published"}
        </span>
      )
    case "SHELVED":
      return (
        <span className="shrink-0 text-[10px] font-medium text-red-500 dark:text-red-400">
          Shelved
        </span>
      )
    default:
      return time ? (
        <span className="shrink-0 text-[10px] text-muted-foreground">{time}</span>
      ) : null
  }
}

export function VideoCard({ video, isDragging }: VideoCardProps) {
  return (
    <Link
      href={`/videos/${video.id}`}
      className={cn(
        "block rounded-lg border bg-card p-3 text-sm transition-colors hover:bg-accent/50",
        STATUS_BORDER[video.status] ?? "",
        isDragging && "shadow-lg ring-2 ring-primary/30"
      )}
      onClick={(e) => {
        if (isDragging) e.preventDefault()
      }}
    >
      <div className="flex flex-col gap-1.5">
        {/* Top row: slug + Video badge (left) · status/time chip (right) */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="font-semibold leading-none truncate">{video.slug}</span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">Video</Badge>
          </div>
          <VideoStatusChip video={video} />
        </div>

        {/* Budget line */}
        {video.budgetLine && (
          <p className="line-clamp-1 text-xs text-muted-foreground">
            {video.budgetLine}
          </p>
        )}

        {/* Bottom row: people chips + AI tag */}
        <div className="flex flex-wrap items-center gap-1">
          {video.assignments.map((a) => (
            <span
              key={`${a.personId}-${a.role}`}
              className="inline-flex items-center justify-center rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground"
              title={a.person.name}
            >
              {initials(a.person.name)}
            </span>
          ))}
          {video.aiContributed && (
            <span
              className="inline-flex items-center gap-0.5 rounded-md bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-400"
              title="AI Contributed"
            >
              <Sparkles className="size-2.5 pointer-events-none" />
              AI
            </span>
          )}
        </div>

        {/* Parent story link label */}
        {video.story && (
          <p className="text-[10px] text-muted-foreground">
            Story: {video.story.slug}
          </p>
        )}
      </div>
    </Link>
  )
}

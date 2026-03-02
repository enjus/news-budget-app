"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { cn, initials, STORY_STATUS_LABELS } from "@/lib/utils"
import type { VideoWithRelations } from "@/types/index"

interface VideoCardProps {
  video: VideoWithRelations
  isDragging?: boolean
}

const STATUS_BADGE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  DRAFT: "outline",
  PUBLISHED_ITERATING: "secondary",
  PUBLISHED_FINAL: "default",
  SHELVED: "destructive",
}

export function VideoCard({ video, isDragging }: VideoCardProps) {
  return (
    <Link
      href={`/videos/${video.id}`}
      className={cn(
        "block rounded-lg border bg-card p-3 text-sm transition-colors hover:bg-accent/50",
        isDragging && "shadow-lg ring-2 ring-primary/30"
      )}
      onClick={(e) => {
        if (isDragging) e.preventDefault()
      }}
    >
      <div className="flex flex-col gap-1.5">
        {/* Top row: slug + badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold leading-none">{video.slug}</span>
          <Badge
            variant={STATUS_BADGE_VARIANT[video.status] ?? "outline"}
            className="text-[10px] px-1.5 py-0"
          >
            {STORY_STATUS_LABELS[video.status] ?? video.status}
          </Badge>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            Video
          </Badge>
        </div>

        {/* Budget line */}
        {video.budgetLine && (
          <p className="line-clamp-1 text-xs text-muted-foreground">
            {video.budgetLine}
          </p>
        )}

        {/* Bottom row: people chips + time */}
        <div className="flex items-center justify-between gap-2">
          {video.assignments.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {video.assignments.map((a) => (
                <span
                  key={`${a.personId}-${a.role}`}
                  className="inline-flex items-center justify-center rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground"
                  title={a.person.name}
                >
                  {initials(a.person.name)}
                </span>
              ))}
            </div>
          ) : (
            <span />
          )}

          {/* Time label — only show if not TBD */}
          {!video.onlinePubDateTBD && video.onlinePubDate && (
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {new Date(video.onlinePubDate).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
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

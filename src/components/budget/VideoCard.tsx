"use client"

import Link from "next/link"
import { Sparkles, Video as VideoIcon } from "lucide-react"
import { cn, surname, ROLE_ABBREV, PERSON_ROLE_LABELS, formatTime } from "@/lib/utils"
import type { VideoWithRelations } from "@/types/index"

interface VideoCardProps {
  video: VideoWithRelations
  isDragging?: boolean
  budgetLineClamp?: 1 | 3
}

const STATUS_BORDER: Record<string, string> = {
  SCHEDULED:       "border-l-4 border-l-blue-400",
  PUBLISHED_FINAL: "border-l-4 border-l-emerald-500",
  SHELVED:         "border-l-4 border-l-red-400",
}

function isPastDue(onlinePubDate: Date | string): boolean {
  const now = new Date()
  const nowFake = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes()))
  return new Date(onlinePubDate) < nowFake
}

function VideoStatusChip({ video }: { video: VideoWithRelations }) {
  const hasTime = !video.onlinePubDateTBD && video.onlinePubDate
  const time = hasTime ? formatTime(video.onlinePubDate) : null

  switch (video.status) {
    case "SCHEDULED": {
      const overdue = hasTime && isPastDue(video.onlinePubDate!)
      return (
        <span className={cn(
          "shrink-0 text-[10px] font-medium",
          overdue ? "text-amber-600 dark:text-amber-400" : "text-blue-600 dark:text-blue-400"
        )}>
          {time ?? "Scheduled"}
        </span>
      )
    }
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

export function VideoCard({ video, isDragging, budgetLineClamp = 1 }: VideoCardProps) {
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
            <VideoIcon className="size-3 shrink-0 text-muted-foreground/60" />
            <span className="font-semibold leading-none">{video.slug}</span>
          </div>
          <VideoStatusChip video={video} />
        </div>

        {/* Budget line */}
        {video.budgetLine && (
          <p className={cn("text-xs text-muted-foreground", budgetLineClamp === 3 ? "line-clamp-3" : "line-clamp-1")}>
            {video.budgetLine}
          </p>
        )}

        {/* Bottom row: people chips + AI tag */}
        <div className="flex flex-wrap items-center gap-1">
          {video.assignments.map((a) => {
            const abbrev = ROLE_ABBREV[a.role]
            return (
              <span
                key={`${a.personId}-${a.role}`}
                className="inline-flex items-center gap-0.5 rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground"
                title={`${a.person.name} — ${PERSON_ROLE_LABELS[a.role] ?? a.role}`}
              >
                {surname(a.person.name)}{abbrev && <span className="text-muted-foreground/70">·{abbrev}</span>}
              </span>
            )
          })}
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

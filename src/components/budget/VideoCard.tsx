"use client"

import Link from "next/link"
import { Video as VideoIcon, Check, MessageSquare } from "lucide-react"
import { cn, surname, displayName, ROLE_ABBREV, PERSON_ROLE_LABELS, formatTime, formatOnlinePubShort } from "@/lib/utils"
import { CARD_SIZE } from "@/components/budget/card-size"
import type { VideoWithRelations } from "@/types/index"

interface VideoCardProps {
  video: VideoWithRelations
  isDragging?: boolean
  showOnlinePubDate?: boolean
  budgetLineClamp?: 1 | 3
  selectMode?: boolean
  isSelected?: boolean
  onToggleSelect?: (currentStatus: string) => void
  /** "lg" bumps type/icon/spacing scale for meeting-room readability (Daily Agenda, Enterprise). Default unchanged. */
  size?: "default" | "lg"
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

// hideTime is true when a full date+time row is shown separately (edition/enterprise).
function VideoStatusChip({ video, hideTime, size = "default" }: { video: VideoWithRelations; hideTime?: boolean; size?: "default" | "lg" }) {
  const s = CARD_SIZE[size]
  const hasTime = !video.onlinePubDateTBD && video.onlinePubDate
  const time = hasTime && !hideTime ? formatTime(video.onlinePubDate) : null

  switch (video.status) {
    case "SCHEDULED": {
      const overdue = hasTime && isPastDue(video.onlinePubDate!)
      return (
        <span className={cn(
          "shrink-0 font-medium",
          s.statusText,
          overdue ? "text-amber-600 dark:text-amber-400" : "text-blue-600 dark:text-blue-400"
        )}>
          {time ?? "Scheduled"}
        </span>
      )
    }
    case "PUBLISHED_FINAL":
      return (
        <span className={cn("shrink-0 font-medium text-emerald-600 dark:text-emerald-400", s.statusText)}>
          {time ? `✓ ${time}` : "✓ Published"}
        </span>
      )
    case "SHELVED":
      return (
        <span className={cn("shrink-0 font-medium text-red-500 dark:text-red-400", s.statusText)}>
          Shelved
        </span>
      )
    default:
      // DRAFT — flag unassigned videos; otherwise show time only if set
      if (video.assignments.length === 0) {
        return (
          <span className={cn("shrink-0 font-medium text-red-500 dark:text-red-400", s.statusText)}>
            Unassigned
          </span>
        )
      }
      return time ? (
        <span className={cn("shrink-0", s.statusText, s.statusMuted)}>{time}</span>
      ) : null
  }
}

export function VideoCard({ video, isDragging, showOnlinePubDate, budgetLineClamp = 1, selectMode, isSelected, onToggleSelect, size = "default" }: VideoCardProps) {
  // Optional chaining: a few list endpoints hand-roll their payload and cast.
  const commentCount = video._count?.comments ?? 0
  const s = CARD_SIZE[size]

  return (
    <Link
      href={`/videos/${video.id}`}
      className={cn(
        "block rounded-lg border bg-card text-sm transition-colors hover:bg-accent/50",
        s.padding,
        STATUS_BORDER[video.status] ?? (video.status === "DRAFT" && video.assignments.length === 0 ? "border-l-4 border-l-red-400" : ""),
        isDragging && "shadow-lg ring-2 ring-primary/30",
        isSelected && "ring-2 ring-primary bg-primary/5",
      )}
      onClick={(e) => {
        if (isDragging) e.preventDefault()
        if (selectMode) {
          e.preventDefault()
          onToggleSelect?.(video.status)
        }
      }}
    >
      <div className={cn("flex", s.outerGap)}>
        {selectMode && (
          <div className="mt-0.5 flex shrink-0 items-start">
            <div className={cn(
              "flex size-4 items-center justify-center rounded border-2 transition-colors",
              isSelected ? "border-primary bg-primary" : "border-muted-foreground/40"
            )}>
              {isSelected && <Check className="size-2.5 stroke-[3] text-primary-foreground" />}
            </div>
          </div>
        )}
        <div className={cn("flex min-w-0 flex-1 flex-col", s.stackGap)}>
          {/* Top row: slug + Video badge (left) · status/time chip (right) */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <VideoIcon className={cn("shrink-0 text-muted-foreground/60", s.titleIcon)} />
              <span className={cn("font-semibold leading-none", s.title)}>{video.slug}</span>
            </div>
            <VideoStatusChip video={video} hideTime={showOnlinePubDate} size={size} />
          </div>

          {/* Budget line */}
          {video.budgetLine && (
            <p className={cn(
              s.body,
              budgetLineClamp === 3 ? "line-clamp-3" : "line-clamp-1",
            )}>
              {video.budgetLine}
            </p>
          )}

          {/* Comment indicator — only when the video has comments */}
          {commentCount > 0 && (
            <div className={cn("flex items-center gap-3", s.metaRow)}>
              <span
                className="flex items-center gap-0.5"
                title={`${commentCount} comment${commentCount === 1 ? "" : "s"}`}
              >
                <MessageSquare className={cn("shrink-0", s.metaIcon)} />
                {commentCount}
              </span>
            </div>
          )}

          {/* Online pub date row — edition / enterprise views */}
          {showOnlinePubDate && (
            <div className={cn("flex items-center gap-1", s.pubRow)}>
              <span className={cn("font-medium", s.pubLabel)}>Online:</span>
              <span className={s.pubValue}>{formatOnlinePubShort(video.onlinePubDate, video.onlinePubDateTBD)}</span>
            </div>
          )}

          {/* Bottom row: people chips + AI tag */}
          <div className={cn("flex flex-wrap items-center", s.chipRowGap)}>
            {video.assignments.map((a) => {
              const abbrev = ROLE_ABBREV[a.role]
              return (
                <span
                  key={`${a.personId}-${a.role}`}
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded-md bg-secondary font-medium text-secondary-foreground",
                    s.chip,
                  )}
                  title={`${displayName(a.person.name)} — ${PERSON_ROLE_LABELS[a.role] ?? a.role}`}                >
                  {surname(a.person.name)}{abbrev && <span className="text-muted-foreground/70">·{abbrev}</span>}
                </span>
              )
            })}
          </div>

          {/* Parent story link label */}
          {video.story && (
            <p className={s.caption}>
              Story: {video.story.slug}
            </p>
          )}
        </div>
      </div>
    </Link>
  )
}

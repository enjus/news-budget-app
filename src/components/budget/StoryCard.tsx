"use client"

import Link from "next/link"
import { Sparkles, Camera, BarChart2, Map, ExternalLink, Video, FileText } from "lucide-react"
import { format } from "date-fns"
import { Badge } from "@/components/ui/badge"
import { cn, surname, ROLE_ABBREV, PERSON_ROLE_LABELS, formatTime } from "@/lib/utils"
import type { StoryListItem } from "@/types/index"

const WORD_COUNT_LIMIT = 1400

// Left border accent keyed to status — DRAFT gets no override (default border)
const STATUS_BORDER: Record<string, string> = {
  SCHEDULED:           "border-l-4 border-l-blue-400",
  PUBLISHED_ITERATING: "border-l-4 border-l-amber-400",
  PUBLISHED_FINAL:     "border-l-4 border-l-emerald-500",
  SHELVED:             "border-l-4 border-l-red-400",
}

/** Compare a newsroom-time-as-UTC pub date against the current newsroom time. */
function isPastDue(onlinePubDate: Date | string): boolean {
  const now = new Date()
  const nowFake = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes()))
  return new Date(onlinePubDate) < nowFake
}

interface StoryCardProps {
  story: StoryListItem
  isDragging?: boolean
  showOnlinePubDate?: boolean
  showPhotoIndicator?: boolean
  showWordCount?: boolean
  hideEnterpriseTag?: boolean
  videoCount?: number
}

// Compact status + time chip shown top-right.
// When hideTime is true (edition/enterprise, where a full date row is shown separately),
// only the status label is rendered.
function StatusTimeChip({
  story,
  hideTime,
}: {
  story: StoryListItem
  hideTime?: boolean
}) {
  const hasTime = !story.onlinePubDateTBD && story.onlinePubDate
  const time = hasTime && !hideTime ? formatTime(story.onlinePubDate) : null

  switch (story.status) {
    case "PUBLISHED_FINAL":
      return (
        <span className="shrink-0 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
          {time ? `✓ ${time}` : "✓ Published"}
        </span>
      )
    case "PUBLISHED_ITERATING":
      return (
        <span className="shrink-0 text-[10px] font-medium text-amber-600 dark:text-amber-400">
          ● Live
        </span>
      )
    case "SCHEDULED": {
      const overdue = hasTime && isPastDue(story.onlinePubDate!)
      return (
        <span className={cn(
          "shrink-0 text-[10px] font-medium",
          overdue ? "text-amber-600 dark:text-amber-400" : "text-blue-600 dark:text-blue-400"
        )}>
          {time ?? "Scheduled"}
        </span>
      )
    }
    case "SHELVED":
      return (
        <span className="shrink-0 text-[10px] font-medium text-red-500 dark:text-red-400">
          Shelved
        </span>
      )
    default:
      // DRAFT — show time only if set, no colour
      return time ? (
        <span className="shrink-0 text-[10px] text-muted-foreground">{time}</span>
      ) : null
  }
}

export function StoryCard({
  story,
  isDragging,
  showOnlinePubDate,
  showPhotoIndicator,
  showWordCount,
  hideEnterpriseTag,
  videoCount,
}: StoryCardProps) {
  const photoCount  = showPhotoIndicator ? story.visuals.filter((v) => v.type === "PHOTO").length   : 0
  const graphicCount = showPhotoIndicator ? story.visuals.filter((v) => v.type === "GRAPHIC").length : 0
  const mapCount     = showPhotoIndicator ? story.visuals.filter((v) => v.type === "MAP").length     : 0
  const hasVisuals   = photoCount > 0 || graphicCount > 0 || mapCount > 0 || (videoCount ?? 0) > 0
  const wordCount = showWordCount ? story.wordCount : null
  const wordCountOver = wordCount != null && wordCount > WORD_COUNT_LIMIT

  function formatOnlinePub(): string {
    if (story.onlinePubDateTBD || !story.onlinePubDate) return "TBD"
    const d = new Date(story.onlinePubDate)
    const fakeLocal = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes())
    return `${format(fakeLocal, "EEE, MMM d")} · ${formatTime(story.onlinePubDate)}`
  }

  return (
    <Link
      href={`/stories/${story.id}`}
      className={cn(
        "block rounded-lg border bg-card p-3 text-sm transition-colors hover:bg-accent/50",
        STATUS_BORDER[story.status] ?? "",
        isDragging && "shadow-lg ring-2 ring-primary/30",
      )}
      onClick={(e) => {
        if (isDragging) e.preventDefault()
      }}
    >
      <div className="flex flex-col gap-1.5">
        {/* Top row: slug + enterprise badge (left) · status/time chip (right) */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <FileText className="size-3 shrink-0 text-muted-foreground/60" />
            <span className="font-semibold leading-none">{story.slug}</span>
            {story.isEnterprise && !hideEnterpriseTag && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                Enterprise
              </Badge>
            )}
          </div>
          <StatusTimeChip story={story} hideTime={showOnlinePubDate} />
        </div>

        {/* Budget line */}
        {story.budgetLine && (
          <p className="line-clamp-1 text-xs text-muted-foreground">{story.budgetLine}</p>
        )}

        {/* Visual indicators row — only when visuals or linked videos are present */}
        {hasVisuals && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {photoCount > 0 && (
              <span className="flex items-center gap-1 font-medium text-sky-600 dark:text-sky-400">
                <Camera className="size-3.5 shrink-0" />
                {photoCount}
              </span>
            )}
            {graphicCount > 0 && (
              <span className="flex items-center gap-1 font-medium text-violet-600 dark:text-violet-400">
                <BarChart2 className="size-3.5 shrink-0" />
                {graphicCount}
              </span>
            )}
            {mapCount > 0 && (
              <span className="flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                <Map className="size-3.5 shrink-0" />
                {mapCount}
              </span>
            )}
            {(videoCount ?? 0) > 0 && (
              <span className="flex items-center gap-1 font-medium text-orange-600 dark:text-orange-400">
                <Video className="size-3.5 shrink-0" />
                {videoCount}
              </span>
            )}
          </div>
        )}

        {/* Online pub date row — edition / enterprise views */}
        {showOnlinePubDate && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="font-medium text-foreground/60">Online:</span>
            <span>{formatOnlinePub()}</span>
          </div>
        )}

        {/* Bottom row: people chips + indicators */}
        <div className="flex flex-wrap items-center gap-1">
          {story.assignments.map((a) => {
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
          {story.aiContributed && (
            <span
              className="inline-flex items-center gap-0.5 rounded-md bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-400"
              title="AI Contributed"
            >
              <Sparkles className="size-2.5 pointer-events-none" />
              AI
            </span>
          )}
          {wordCount != null && (
            <span
              className={cn(
                "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                wordCountOver
                  ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
                  : "bg-secondary text-secondary-foreground",
              )}
              title={
                wordCountOver
                  ? `Over ${WORD_COUNT_LIMIT.toLocaleString()} word limit`
                  : "Word count"
              }
            >
              {wordCount.toLocaleString()} wds
            </span>
          )}
          {story.postUrl &&
            (story.status === "PUBLISHED_FINAL" || story.status === "PUBLISHED_ITERATING") && (
            <a
              href={story.postUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-0.5 rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground hover:bg-accent"
              title="Open published post"
            >
              <ExternalLink className="size-2.5" />
              Post
            </a>
          )}
        </div>
      </div>
    </Link>
  )
}

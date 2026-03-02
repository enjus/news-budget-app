"use client"

import Link from "next/link"
import { Sparkles, Camera } from "lucide-react"
import { format } from "date-fns"
import { Badge } from "@/components/ui/badge"
import { cn, initials, STORY_STATUS_LABELS } from "@/lib/utils"
import type { StoryWithRelations } from "@/types/index"

const WORD_COUNT_LIMIT = 1400

interface StoryCardProps {
  story: StoryWithRelations
  isDragging?: boolean
  showOnlinePubDate?: boolean
  showPhotoIndicator?: boolean
  showWordCount?: boolean
  hideEnterpriseTag?: boolean
}

const STATUS_BADGE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  DRAFT: "outline",
  SCHEDULED: "secondary",
  PUBLISHED_ITERATING: "secondary",
  PUBLISHED_FINAL: "default",
  SHELVED: "destructive",
}

export function StoryCard({ story, isDragging, showOnlinePubDate, showPhotoIndicator, showWordCount, hideEnterpriseTag }: StoryCardProps) {
  const photoCount = showPhotoIndicator
    ? story.visuals.filter((v) => v.type === "PHOTO").length
    : 0
  const wordCount = showWordCount ? ((story as any).wordCount as number | null | undefined) : null
  const wordCountOver = wordCount != null && wordCount > WORD_COUNT_LIMIT

  function formatOnlinePub(): string {
    if (story.onlinePubDateTBD || !story.onlinePubDate) return "TBD"
    const d = new Date(story.onlinePubDate)
    return format(d, "EEE, MMM d · h:mm a")
  }
  return (
    <Link
      href={`/stories/${story.id}`}
      className={cn(
        "block rounded-lg border bg-card p-3 text-sm transition-colors hover:bg-accent/50",
        isDragging && "shadow-lg ring-2 ring-primary/30"
      )}
      // Prevent link navigation while dragging
      onClick={(e) => {
        if (isDragging) e.preventDefault()
      }}
    >
      <div className="flex flex-col gap-1.5">
        {/* Top row: slug + badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold leading-none">{story.slug}</span>
          {story.status !== "DRAFT" && (
            <Badge
              variant={STATUS_BADGE_VARIANT[story.status] ?? "outline"}
              className="text-[10px] px-1.5 py-0"
            >
              {STORY_STATUS_LABELS[story.status] ?? story.status}
            </Badge>
          )}
          {story.isEnterprise && !hideEnterpriseTag && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              Enterprise
            </Badge>
          )}
        </div>

        {/* Budget line */}
        {story.budgetLine && (
          <p className="line-clamp-1 text-xs text-muted-foreground">
            {story.budgetLine}
          </p>
        )}

        {/* Online pub date row — edition view only */}
        {showOnlinePubDate && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="font-medium text-foreground/60">Online:</span>
            <span>{formatOnlinePub()}</span>
          </div>
        )}

        {/* Bottom row: people chips + AI tag + photo indicator + time */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1">
            {story.assignments.map((a) => (
              <span
                key={`${a.personId}-${a.role}`}
                className="inline-flex items-center justify-center rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground"
                title={a.person.name}
              >
                {initials(a.person.name)}
              </span>
            ))}
            {story.aiContributed && (
              <span
                className="inline-flex items-center gap-0.5 rounded-md bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-400"
                title="AI Contributed"
              >
                <Sparkles className="size-2.5 pointer-events-none" />
                AI
              </span>
            )}
            {photoCount > 0 && (
              <span
                className="inline-flex items-center gap-0.5 rounded-md bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-950/40 dark:text-sky-400"
                title={`${photoCount} photo${photoCount > 1 ? "s" : ""}`}
              >
                <Camera className="size-2.5 pointer-events-none" />
                {photoCount}
              </span>
            )}
            {wordCount != null && (
              <span
                className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                  wordCountOver
                    ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
                    : "bg-secondary text-secondary-foreground"
                }`}
                title={wordCountOver ? `Over ${WORD_COUNT_LIMIT.toLocaleString()} word limit` : "Word count"}
              >
                {wordCount.toLocaleString()} wds
              </span>
            )}
          </div>

          {/* Time label — only show if not TBD and not already showing full date */}
          {!showOnlinePubDate && !story.onlinePubDateTBD && story.onlinePubDate && (
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {new Date(story.onlinePubDate).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}

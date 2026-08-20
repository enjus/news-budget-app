"use client"

import { useState } from "react"
import Link from "next/link"
import { Sparkles, Camera, BarChart2, Map, ExternalLink, Video, FileText, Check, Clipboard, MapPin, Repeat2, Sun, Landmark, Clapperboard, MessageSquare, type LucideIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn, surname, ROLE_ABBREV, PERSON_ROLE_LABELS, formatTime, formatOnlinePubShort, formatBudgetLineCopy, STORY_TAG_LABELS, STORY_TAG_ABBREV, STORY_TAG_COLOR } from "@/lib/utils"
import type { StoryListItem } from "@/types/index"

// Icons for StoryTag values — kept here (not in utils.ts) since they're components.
const TAG_ICON: Record<string, LucideIcon> = {
  HERE_IS_OREGON: MapPin,
  CONTENT_REMIX: Repeat2,
  SUMMER_FOCUS: Sun,
  OREGON_INSIGHT: Landmark,
  VIDEO_POTENTIAL: Clapperboard,
}

const WORD_COUNT_LIMIT = 1400

// Left border accent keyed to status — DRAFT falls through to the
// unassigned/due overrides applied inline where this map is consulted.
const STATUS_BORDER: Record<string, string> = {
  SCHEDULED:           "border-l-4 border-l-blue-400",
  PUBLISHED_ITERATING: "border-l-4 border-l-emerald-500",
  PUBLISHED_FINAL:     "border-l-4 border-l-emerald-500",
  SHELVED:             "border-l-4 border-l-red-400",
}

/** Compare a newsroom-time-as-UTC pub date against the current newsroom time. */
function isPastDue(onlinePubDate: Date | string): boolean {
  const now = new Date()
  const nowFake = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes()))
  return new Date(onlinePubDate) < nowFake
}

/** DRAFT, assigned, with a fixed pub date that has already passed — nobody confirmed it's ready. */
function isDraftDue(story: StoryListItem): boolean {
  return (
    story.status === "DRAFT" &&
    story.assignments.length > 0 &&
    !story.onlinePubDateTBD &&
    !!story.onlinePubDate &&
    isPastDue(story.onlinePubDate)
  )
}

interface StoryCardProps {
  story: StoryListItem
  isDragging?: boolean
  showOnlinePubDate?: boolean
  showPhotoIndicator?: boolean
  showWordCount?: boolean
  hideEnterpriseTag?: boolean
  videoCount?: number
  budgetLineClamp?: 1 | 3
  selectMode?: boolean
  isSelected?: boolean
  onToggleSelect?: (currentStatus: string) => void
  /** "lg" bumps type/icon/spacing scale for meeting-room readability (Daily Agenda, Enterprise). Default unchanged. */
  size?: "default" | "lg"
}

// Compact status + time chip shown top-right.
// When hideTime is true (edition/enterprise, where a full date row is shown separately),
// only the status label is rendered.
function StatusTimeChip({
  story,
  hideTime,
  size = "default",
}: {
  story: StoryListItem
  hideTime?: boolean
  size?: "default" | "lg"
}) {
  const hasTime = !story.onlinePubDateTBD && story.onlinePubDate
  const time = hasTime && !hideTime ? formatTime(story.onlinePubDate) : null
  const textSize = size === "lg" ? "text-sm" : "text-[10px]"

  switch (story.status) {
    case "PUBLISHED_FINAL":
      return (
        <span className={cn("shrink-0 font-medium text-emerald-600 dark:text-emerald-400", textSize)}>
          {time ? `✓ ${time}` : "✓ Published"}
        </span>
      )
    case "PUBLISHED_ITERATING":
      return (
        <span className={cn("shrink-0 font-medium text-amber-600 dark:text-amber-400", textSize)}>
          ● Updating
        </span>
      )
    case "SCHEDULED": {
      const overdue = hasTime && isPastDue(story.onlinePubDate!)
      return (
        <span className={cn(
          "shrink-0 font-medium",
          textSize,
          overdue ? "text-amber-600 dark:text-amber-400" : "text-blue-600 dark:text-blue-400"
        )}>
          {time ?? "Scheduled"}
        </span>
      )
    }
    case "SHELVED":
      return (
        <span className={cn("shrink-0 font-medium text-red-500 dark:text-red-400", textSize)}>
          Shelved
        </span>
      )
    default: {
      // DRAFT — flag unassigned stories first, then stories whose target pub
      // date has passed while still in DRAFT (nobody locked in readiness).
      if (story.assignments.length === 0) {
        return (
          <span className={cn("shrink-0 font-medium text-red-500 dark:text-red-400", textSize)}>
            Unassigned
          </span>
        )
      }
      if (isDraftDue(story)) {
        return (
          <span className={cn("shrink-0 font-medium text-amber-600 dark:text-amber-400", textSize)}>
            ⚠ Due{time ? ` ${time}` : ""}
          </span>
        )
      }
      return time ? (
        <span className={cn("shrink-0", textSize, size === "lg" ? "text-foreground/70" : "text-muted-foreground")}>{time}</span>
      ) : null
    }
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
  budgetLineClamp = 1,
  selectMode,
  isSelected,
  onToggleSelect,
  size = "default",
}: StoryCardProps) {
  const [copied, setCopied] = useState(false)
  const isLg = size === "lg"

  function handleCopy(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    navigator.clipboard.writeText(formatBudgetLineCopy(story)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  const hasPhoto    = showPhotoIndicator ? story.visuals.some((v) => v.type === "PHOTO")   : false
  const hasGraphic  = showPhotoIndicator ? story.visuals.some((v) => v.type === "GRAPHIC") : false
  const hasMap      = showPhotoIndicator ? story.visuals.some((v) => v.type === "MAP")     : false
  const hasVisualVideo = showPhotoIndicator ? story.visuals.some((v) => v.type === "VIDEO") : false
  const hasVisuals   = hasPhoto || hasGraphic || hasMap || hasVisualVideo || (videoCount ?? 0) > 0
  // Optional chaining: a few list endpoints hand-roll their payload and cast.
  const commentCount = story._count?.comments ?? 0
  const wordCount = showWordCount ? story.wordCount : null
  const wordCountOver = wordCount != null && wordCount > WORD_COUNT_LIMIT

  return (
    <Link
      href={`/stories/${story.id}`}
      className={cn(
        "group block rounded-lg border bg-card text-sm transition-colors hover:bg-accent/50",
        isLg ? "p-4" : "p-3",
        STATUS_BORDER[story.status] ?? (
          story.status === "DRAFT" && story.assignments.length === 0
            ? "border-l-4 border-l-red-400"
            : isDraftDue(story)
              ? "border-l-4 border-l-amber-400"
              : ""
        ),
        isDragging && "shadow-lg ring-2 ring-primary/30",
        isSelected && "ring-2 ring-primary bg-primary/5",
      )}
      onClick={(e) => {
        if (isDragging) e.preventDefault()
        if (selectMode) {
          e.preventDefault()
          onToggleSelect?.(story.status)
        }
      }}
    >
      <div className={cn("flex", isLg ? "gap-3" : "gap-2.5")}>
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
        <div className={cn("flex min-w-0 flex-1 flex-col", isLg ? "gap-2" : "gap-1.5")}>
          {/* Top row: slug + enterprise badge (left) · copy button + status/time chip (right) */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <FileText className={cn("shrink-0 text-muted-foreground/60", isLg ? "size-4" : "size-3")} />
              <span className={cn("font-semibold leading-none", isLg && "text-base")}>{story.slug}</span>
              {story.isEnterprise && !hideEnterpriseTag && (
                <Badge variant="secondary" className={isLg ? "text-xs px-2 py-0.5" : "text-[10px] px-1.5 py-0"}>
                  Enterprise
                </Badge>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                onClick={handleCopy}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/50 hover:text-muted-foreground"
                title="Copy budget line"
              >
                {copied
                  ? <Check className={cn("text-emerald-500", isLg ? "size-4" : "size-3")} />
                  : <Clipboard className={isLg ? "size-4" : "size-3"} />
                }
              </button>
              <StatusTimeChip story={story} hideTime={showOnlinePubDate} size={size} />
            </div>
          </div>

          {/* Budget line */}
          {story.budgetLine && (
            <p className={cn(
              isLg ? "text-base text-foreground/70" : "text-xs text-muted-foreground",
              budgetLineClamp === 3 ? "line-clamp-3" : "line-clamp-1",
            )}>{story.budgetLine}</p>
          )}

          {/* Visual indicators row — only when visuals, linked videos or comments are present */}
          {(hasVisuals || commentCount > 0) && (
            <div className={cn("flex items-center gap-3", isLg ? "text-sm text-foreground/70" : "text-xs text-muted-foreground")}>
              {hasPhoto && (
                <span className="flex items-center text-sky-600 dark:text-sky-400" title="Photo">
                  <Camera className={cn("shrink-0", isLg ? "size-5" : "size-3.5")} />
                </span>
              )}
              {hasGraphic && (
                <span className="flex items-center text-violet-600 dark:text-violet-400" title="Graphic">
                  <BarChart2 className={cn("shrink-0", isLg ? "size-5" : "size-3.5")} />
                </span>
              )}
              {hasMap && (
                <span className="flex items-center text-emerald-600 dark:text-emerald-400" title="Map">
                  <Map className={cn("shrink-0", isLg ? "size-5" : "size-3.5")} />
                </span>
              )}
              {(hasVisualVideo || (videoCount ?? 0) > 0) && (
                <span className="flex items-center text-orange-600 dark:text-orange-400" title="Video">
                  <Video className={cn("shrink-0", isLg ? "size-5" : "size-3.5")} />
                </span>
              )}
              {commentCount > 0 && (
                <span
                  className="flex items-center gap-0.5"
                  title={`${commentCount} comment${commentCount === 1 ? "" : "s"}`}
                >
                  <MessageSquare className={cn("shrink-0", isLg ? "size-5" : "size-3.5")} />
                  {commentCount}
                </span>
              )}
            </div>
          )}

          {/* Online pub date row — edition / enterprise views */}
          {showOnlinePubDate && (
            <div className={cn("flex items-center gap-1", isLg ? "text-sm" : "text-[10px] text-muted-foreground")}>
              <span className={cn("font-medium", isLg ? "text-foreground/80" : "text-foreground/60")}>Online:</span>
              <span className={isLg ? "text-foreground/70" : undefined}>{formatOnlinePubShort(story.onlinePubDate, story.onlinePubDateTBD)}</span>
            </div>
          )}

          {/* Bottom row: people chips + indicators */}
          <div className={cn("flex flex-wrap items-center", isLg ? "gap-1.5" : "gap-1")}>
            {story.assignments.map((a) => {
              const abbrev = ROLE_ABBREV[a.role]
              return (
                <span
                  key={`${a.personId}-${a.role}`}
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded-md bg-secondary font-medium text-secondary-foreground",
                    isLg ? "px-2 py-1 text-sm" : "px-1.5 py-0.5 text-[10px]",
                  )}
                  title={`${a.person.name} — ${PERSON_ROLE_LABELS[a.role] ?? a.role}`}
                >
                  {surname(a.person.name)}{abbrev && <span className="text-muted-foreground/70">·{abbrev}</span>}
                </span>
              )
            })}
            {story.aiContributed && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-md bg-violet-100 font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-400",
                  isLg ? "px-2 py-1 text-sm" : "px-1.5 py-0.5 text-[10px]",
                )}
                title="AI Contributed"
              >
                <Sparkles className={cn("pointer-events-none", isLg ? "size-3.5" : "size-2.5")} />
                AI
              </span>
            )}
            {story.tags.map((t) => {
              const Icon = TAG_ICON[t.tag]
              return (
                <span
                  key={t.id}
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded-md font-medium",
                    isLg ? "px-2 py-1 text-sm" : "px-1.5 py-0.5 text-[10px]",
                    STORY_TAG_COLOR[t.tag],
                  )}
                  title={STORY_TAG_LABELS[t.tag] ?? t.tag}
                >
                  {Icon && <Icon className={cn("pointer-events-none", isLg ? "size-3.5" : "size-2.5")} />}
                  {STORY_TAG_ABBREV[t.tag] ?? t.tag}
                </span>
              )
            })}
            {wordCount != null && (
              <span
                className={cn(
                  "inline-flex items-center rounded-md font-medium",
                  isLg ? "px-2 py-1 text-sm" : "px-1.5 py-0.5 text-[10px]",
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
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-md bg-secondary font-medium text-secondary-foreground hover:bg-accent",
                  isLg ? "px-2 py-1 text-sm" : "px-1.5 py-0.5 text-[10px]",
                )}
                title="Open published post"
              >
                <ExternalLink className={isLg ? "size-3.5" : "size-2.5"} />
                Post
              </a>
            )}
            {story.workingDraftUrl &&
              story.status !== "PUBLISHED_FINAL" &&
              story.status !== "PUBLISHED_ITERATING" && (
              <a
                href={story.workingDraftUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-md bg-secondary font-medium text-secondary-foreground hover:bg-accent",
                  isLg ? "px-2 py-1 text-sm" : "px-1.5 py-0.5 text-[10px]",
                )}
                title="Open working draft"
              >
                <FileText className={isLg ? "size-3.5" : "size-2.5"} />
                Draft
              </a>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}

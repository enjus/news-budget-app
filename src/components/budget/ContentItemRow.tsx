"use client"

import Link from "next/link"
import { FileText, Video } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { PERSON_ROLE_LABELS, STORY_STATUS_LABELS, formatItemDate, itemDateStr, todayString } from "@/lib/utils"
import type { PersonContentItem } from "@/app/api/people/[id]/content/route"

/** A single assigned-content row: icon, slug, role badge, status badge,
 *  budget line, and formatted pub date. Shared by /me, /people/[id], and the
 *  My Teams member view — previously three near-identical copies.
 *
 *  `highlightToday`: when true, items due today get a small "Today" badge
 *  next to the date — opt-in so only /me's Upcoming section (where "what's
 *  due today" is the relevant question) renders it. */
export function ContentRow({
  item,
  highlightToday = false,
}: {
  item: PersonContentItem
  highlightToday?: boolean
}) {
  const href = item.type === "story" ? `/stories/${item.id}` : `/videos/${item.id}`
  const Icon = item.type === "story" ? FileText : Video
  const isToday = highlightToday && itemDateStr(item) === todayString()

  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-md px-3 py-2 text-sm hover:bg-accent/50 transition-colors"
    >
      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{item.slug}</span>
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
          {/* onBudget is distinct from item.status === "DRAFT" (the editorial
              StoryStatus enum value, e.g. an unpublished-but-on-budget story) —
              this flags the off-budget/staging concept instead. */}
          {!item.onBudget && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-dashed text-muted-foreground">
              Not yet budgeted
            </Badge>
          )}
        </div>
        {item.budgetLine && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.budgetLine}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {isToday && (
          <Badge className="text-[10px] px-1.5 py-0">Today</Badge>
        )}
        <span className="text-xs text-muted-foreground">
          {formatItemDate(item)}
        </span>
      </div>
    </Link>
  )
}

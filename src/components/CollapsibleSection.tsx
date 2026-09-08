"use client"

import { ChevronDown, ChevronRight } from "lucide-react"

/** Generic collapsible section header: chevron + title + `(count)`, with an
 *  optional `(count+)` / "showing most recent" disclosure when the list
 *  behind it was truncated server-side (see /api/teams/[id]/content and the
 *  capped mode of /api/people/[id]/content). Shared by /me, /people/[id],
 *  and the My Teams member view — previously three near-identical copies. */
export function CollapsibleSection({
  title,
  count,
  truncated,
  open,
  onToggle,
  compact = false,
  children,
}: {
  title: string
  count: number
  truncated?: boolean
  open: boolean
  onToggle: () => void
  /** Smaller chevron/text, for use nested inside another card (e.g. a team
   *  member row) rather than as a top-level page section. */
  compact?: boolean
  children: React.ReactNode
}) {
  const Chevron = open ? ChevronDown : ChevronRight
  return (
    <div>
      <button
        onClick={onToggle}
        className={
          compact
            ? "flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground mb-1 transition-colors"
            : "flex w-full items-center gap-1.5 pb-2 text-sm font-medium hover:text-foreground text-foreground/80 transition-colors"
        }
      >
        <Chevron className={compact ? "size-3 shrink-0" : "size-3.5 shrink-0"} />
        {title}
        <span className="font-normal">
          ({count}{truncated ? "+" : ""})
        </span>
        {truncated && (
          <span
            className="text-xs font-normal text-muted-foreground/70"
            title="Older items exist but aren't shown here."
          >
            showing most recent
          </span>
        )}
      </button>
      {open && children}
    </div>
  )
}

export function EmptySection() {
  return (
    <p className="py-4 text-center text-sm text-muted-foreground">None</p>
  )
}

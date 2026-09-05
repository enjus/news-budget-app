// Shared resolved-day → color/label mapping, lifted out of MonthCalendar's
// original cellClasses()/cellLabel() (Phase 2) so /schedule/today and
// /schedule/teams (Phase 3) don't grow a second and third copy of the same
// verdict-to-appearance logic (issue #19 Phase 2 progress note).

import type { ResolvedDay, ResolvedSegment } from "@/lib/schedule"

export type ResolvedDayLike = ResolvedDay | undefined

export function resolvedDayClasses(day: ResolvedDayLike): string {
  if (!day) return "bg-transparent"
  if (day.split) return "bg-amber-100 dark:bg-amber-950/40"
  if (day.status === "off" && day.reason === "regular") return "bg-muted text-muted-foreground"
  if (day.status === "off" && day.reason === "holiday") return "bg-violet-100 dark:bg-violet-950/40"
  if (day.status === "off" && day.reason === "availability") return "bg-rose-100 dark:bg-rose-950/40"
  if (day.status === "unavailable") return "bg-amber-100 dark:bg-amber-950/40"
  return "bg-transparent"
}

export function resolvedDayLabel(day: ResolvedDayLike): string {
  if (!day) return ""
  if (day.split) return "Split"
  if (day.status === "off" && day.reason === "regular") return "Off"
  if (day.status === "off" && day.reason === "holiday") return day.markerLabel
  if (day.status === "off" && day.reason === "availability") return "Out"
  if (day.status === "unavailable") return "Unavailable"
  if (day.status === "working" && day.source === "availability") return "Working"
  return ""
}

/** Short per-segment label for a split (AM/PM) day — which half is worked
 *  and which isn't is exactly the thing a split day exists to communicate,
 *  so every status (including a plain working half) gets a real label here,
 *  unlike resolvedDayLabel's whole-day "blank means working normally"
 *  convention. */
export function resolvedSegmentLabel(segment: ResolvedSegment): string {
  if (segment.status === "off" && segment.reason === "regular") return "Off"
  if (segment.status === "off" && segment.reason === "holiday") return segment.markerLabel
  if (segment.status === "off" && segment.reason === "availability") return "Out"
  if (segment.status === "unavailable") return "Unavailable"
  return "Working"
}

/** Background color for one half of a split day — parallels
 *  resolvedDayClasses but per-segment, so AM and PM can be colored
 *  independently instead of both halves sharing one "split" amber tint. */
export function resolvedSegmentClasses(segment: ResolvedSegment): string {
  if (segment.status === "off" && segment.reason === "regular") return "bg-muted text-muted-foreground"
  if (segment.status === "off" && segment.reason === "holiday") return "bg-violet-100 dark:bg-violet-950/40"
  if (segment.status === "off" && segment.reason === "availability") return "bg-rose-100 dark:bg-rose-950/40"
  if (segment.status === "unavailable") return "bg-amber-100 dark:bg-amber-950/40"
  return "bg-transparent"
}

interface AvailabilityChipProps {
  day: ResolvedDayLike
  /** Small flag for an entry that falls inside an active PTO blackout
   *  (issue #19 §3: "a flag on the chip... a manager scanning the week sees
   *  the exceptions after the fact"). Only meaningful for explicit entries. */
  inBlackout?: boolean
  /** "sm" for compact grid cells (team grid), "md" for month-calendar cells. */
  size?: "sm" | "md"
  className?: string
}

/** Renders just the color+label chip content — callers own their own
 *  clickable wrapper (a whole grid cell, or a smaller area inside a day
 *  button alongside a date number) since that chrome differs per view.
 *
 *  A split day renders as two stacked halves, each independently colored
 *  and labeled — which half is worked and which isn't is exactly the
 *  information a split day exists to carry, so collapsing it to a single
 *  "Split" chip (the original behavior) lost the one thing worth showing. */
export function AvailabilityChip({ day, inBlackout, size = "md", className }: AvailabilityChipProps) {
  const textSize = size === "sm" ? "text-[10px]" : "text-xs"

  if (day?.split) {
    return (
      <div className={`rounded overflow-hidden ${className ?? ""}`}>
        <div className={`truncate px-1 py-0.5 ${textSize} ${resolvedSegmentClasses(day.am)}`} title={`AM: ${resolvedSegmentLabel(day.am)}`}>
          AM {resolvedSegmentLabel(day.am)}
        </div>
        <div className={`truncate px-1 py-0.5 ${textSize} ${resolvedSegmentClasses(day.pm)}`} title={`PM: ${resolvedSegmentLabel(day.pm)}`}>
          PM {resolvedSegmentLabel(day.pm)}
        </div>
        {inBlackout && (
          <span className="px-1 text-amber-600 dark:text-amber-400" title="Falls inside the PTO blackout">
            ●
          </span>
        )}
      </div>
    )
  }

  const label = resolvedDayLabel(day)
  return (
    <div
      className={`rounded ${size === "sm" ? "px-1 py-0.5 text-[11px]" : "px-1.5 py-1 text-xs"} ${resolvedDayClasses(day)} ${className ?? ""}`}
    >
      <span className="truncate block">{label}</span>
      {inBlackout && (
        <span className="ml-0.5 text-amber-600 dark:text-amber-400" title="Falls inside the PTO blackout">
          ●
        </span>
      )}
    </div>
  )
}

"use client"

// Holiday/blackout/note bands across a displayed week — the primary way the
// PTO blackout does its job (issue #19 §3: visible before anyone opens an
// entry form). Layout math (resolveMarkerBands/bandSpan) lives in
// src/lib/schedule.ts, pure and unit-tested, so the "full week" edge case
// can't silently regress; this component only renders the result.

import { Ban, CalendarDays, CalendarOff, StickyNote, type LucideIcon } from "lucide-react"
import { resolveMarkerBands } from "@/lib/schedule"
import { dateOnly, toDateString } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { CalendarMarker } from "@prisma/client"

interface MarkerBandProps {
  /** The displayed week's dates, in the same left-to-right order as the day
   *  columns above/below this band. */
  weekDates: string[]
  markers: CalendarMarker[]
  /** Override for the grid's column template — the team grid's Month view
   *  uses minmax() columns so it can scroll sideways, and the band has to
   *  share exactly that template to stay aligned with the day columns. */
  columnTemplate?: string
  /** Clip every band to this inclusive YYYY-MM-DD range — the month grid
   *  passes the visible, tracked part of its month so a band never runs
   *  over blank padding or "See spreadsheet" cells. The popover still shows
   *  the marker's real, unclipped dates. */
  visibleRange?: { from: string; to: string }
}

interface KindStyle {
  name: string
  icon: LucideIcon
  classes: string
}

// Each kind gets an icon and a distinct treatment, so a band can't be
// mistaken for a day-cell chip: only an observed holiday (a real day off)
// is a solid fill in the same violet as its "off" chip; an unobserved
// holiday is an outline, a blackout a dashed amber border (amber matching
// AvailabilityChip's "inside the PTO blackout" dot).
function kindStyle(marker: CalendarMarker): KindStyle {
  if (marker.kind === "HOLIDAY" && marker.observed) {
    return {
      name: "Holiday (newsroom off)",
      icon: CalendarOff,
      classes: "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300",
    }
  }
  if (marker.kind === "HOLIDAY") {
    return {
      name: "Holiday (not observed — normal workday)",
      icon: CalendarDays,
      classes: "border border-violet-300 text-violet-800 dark:border-violet-800 dark:text-violet-300",
    }
  }
  if (marker.kind === "BLACKOUT") {
    return {
      name: "PTO blackout",
      icon: Ban,
      classes:
        "border border-dashed border-amber-500 bg-amber-50 text-amber-900 dark:border-amber-600 dark:bg-amber-950/30 dark:text-amber-200",
    }
  }
  return {
    name: "Note",
    icon: StickyNote,
    classes: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300",
  }
}

function formatRange(startDate: Date | string, endDate: Date | string): string {
  const fmt = (d: Date | string) =>
    new Date(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
  const start = toDateString(new Date(startDate))
  const end = toDateString(new Date(endDate))
  return start === end ? fmt(startDate) : `${fmt(startDate)} – ${fmt(endDate)}`
}

/** One row per marker, grid-positioned to the columns it covers — a marker
 *  spanning the entire displayed week renders as a full-width band, not a
 *  span that assumes both edges are visible (issue #19 §3). Each band is a
 *  button opening a popover with the full label, kind, real dates and note,
 *  so they're reachable on touch and by keyboard, not only by hover. */
export function MarkerBand({ weekDates, markers, columnTemplate, visibleRange }: MarkerBandProps) {
  // CalendarMarker.startDate/endDate arrive over SWR/fetch as JSON-serialized
  // ISO strings, not Date instances — bandSpan()/toDateString() need Dates.
  const asDates = markers.flatMap((m) => {
    let start = toDateString(new Date(m.startDate))
    let end = toDateString(new Date(m.endDate))
    if (visibleRange) {
      if (start < visibleRange.from) start = visibleRange.from
      if (end > visibleRange.to) end = visibleRange.to
      if (start > end) return []
    }
    return [{ ...m, startDate: dateOnly(start), endDate: dateOnly(end) }]
  })
  const bands = resolveMarkerBands(weekDates, asDates)
  if (bands.length === 0) return null
  const byId = new Map(markers.map((m) => [m.id, m]))

  return (
    <div className="space-y-1 pb-1">
      {bands.map((band) => {
        const marker = byId.get(band.markerId)
        if (!marker) return null
        const style = kindStyle(marker)
        const Icon = style.icon
        return (
          <div key={band.markerId} className="grid gap-1" style={{ gridTemplateColumns: columnTemplate ?? `repeat(${weekDates.length}, 1fr)` }}>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={`flex min-w-0 items-center gap-1 rounded px-1.5 py-1 text-left text-xs font-medium cursor-pointer hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${style.classes}`}
                  style={{ gridColumn: `${band.startCol + 1} / span ${band.span}` }}
                  title={marker.note ? `${band.label} — ${marker.note}` : band.label}
                  aria-label={`${style.name}: ${band.label}${marker.note ? " (has note)" : ""}`}
                >
                  <Icon className="size-3 shrink-0" aria-hidden />
                  <span className="truncate">{band.label}</span>
                  {marker.note && (
                    <span className="ml-auto shrink-0 text-sky-600 dark:text-sky-400" aria-hidden>
                      ●
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 space-y-1.5 p-3 text-sm">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Icon className="size-3.5 shrink-0" aria-hidden />
                  {style.name}
                </div>
                <div className="font-medium break-words">{marker.label}</div>
                <div className="text-xs text-muted-foreground">{formatRange(marker.startDate, marker.endDate)}</div>
                {marker.note && <p className="whitespace-pre-wrap break-words text-sm">{marker.note}</p>}
              </PopoverContent>
            </Popover>
          </div>
        )
      })}
    </div>
  )
}

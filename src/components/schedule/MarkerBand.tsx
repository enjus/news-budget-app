// Holiday/blackout/note bands across a displayed week — the primary way the
// PTO blackout does its job (issue #19 §3: visible before anyone opens an
// entry form). Layout math (resolveMarkerBands/bandSpan) lives in
// src/lib/schedule.ts, pure and unit-tested, so the "full week" edge case
// can't silently regress; this component only renders the result.

import { resolveMarkerBands } from "@/lib/schedule"
import type { CalendarMarker } from "@prisma/client"

interface MarkerBandProps {
  /** The displayed week's dates, in the same left-to-right order as the day
   *  columns above/below this band. */
  weekDates: string[]
  markers: CalendarMarker[]
}

const KIND_CLASSES: Record<string, string> = {
  HOLIDAY: "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300",
  BLACKOUT: "bg-secondary text-secondary-foreground",
  NOTE: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300",
}

/** One row per marker, grid-positioned to the columns it covers — a marker
 *  spanning the entire displayed week renders as a full-width band, not a
 *  span that assumes both edges are visible (issue #19 §3). */
export function MarkerBand({ weekDates, markers }: MarkerBandProps) {
  // CalendarMarker.startDate/endDate arrive over SWR/fetch as JSON-serialized
  // ISO strings, not Date instances — bandSpan()/toDateString() need Dates.
  const asDates = markers.map((m) => ({
    ...m,
    startDate: new Date(m.startDate),
    endDate: new Date(m.endDate),
  }))
  const bands = resolveMarkerBands(weekDates, asDates)
  if (bands.length === 0) return null

  return (
    <div className="space-y-1 pb-1">
      {bands.map((band) => (
        <div key={band.markerId} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${weekDates.length}, 1fr)` }}>
          <div
            className={`truncate rounded px-2 py-1 text-xs font-medium ${KIND_CLASSES[band.kind] ?? "bg-muted"}`}
            style={{ gridColumn: `${band.startCol + 1} / span ${band.span}` }}
            title={band.label}
          >
            {band.label}
          </div>
        </div>
      ))}
    </div>
  )
}

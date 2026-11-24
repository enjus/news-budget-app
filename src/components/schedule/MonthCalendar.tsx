"use client"

import { useEffect, useState } from "react"
import { toDateString } from "@/lib/utils"
import { isBeforeScheduleStart, SCHEDULE_START_DATE } from "@/lib/schedule"
import { AvailabilityChip } from "@/components/schedule/AvailabilityChip"
import { MarkerBand } from "@/components/schedule/MarkerBand"
import type { CalendarMarker } from "@prisma/client"
import type { MyScheduleDay } from "@/lib/hooks/useMySchedule"

interface MonthCalendarProps {
  /** First-of-month date, YYYY-MM-DD. */
  monthStart: string
  days: MyScheduleDay[]
  /** A single click (no drag) still goes through this, pre-filling the
   *  picker's range to just that one day. */
  onDayClick: (date: string) => void
  /** A drag across two or more days in the same week row. Dates are always
   *  in chronological order regardless of drag direction. */
  onRangeSelect: (dates: string[]) => void
  /** Calendar markers overlapping the month. PTO blackouts, notes and
   *  unobserved holidays are banded above each week row they touch; observed
   *  holidays are skipped, since resolveDay() already shows them in the
   *  affected day cells. */
  markers?: CalendarMarker[]
}

const WEEKDAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

interface DragState {
  weekIdx: number
  startCol: number
  endCol: number
}

/** Generic month grid, taking resolved days as a prop so it isn't hardwired
 *  to the "me" view — Phase 3's team/absence views reuse it. Observed
 *  holidays aren't banded here: resolveDay() already bakes their effect into
 *  each affected day (status "off", reason "holiday"), and AvailabilityChip
 *  surfaces that inline via the day's own markerLabel. Every other marker
 *  (PTO blackouts, calendar notes, unobserved holidays) has no effect on a
 *  day's verdict, so it gets a MarkerBand above each week row it touches,
 *  clipped to the month (and to the schedule start) so it never runs over
 *  blank padding or "See spreadsheet" cells.
 *  Weeks are Monday–Sunday, matching the app's standard week (mondayOf(),
 *  the team schedule grid) — not JS's native Sunday-first getUTCDay().
 *
 *  Drag-to-select mirrors /schedule/teams' TeamsView (same mousedown/
 *  mouseenter/window-mouseup pattern), scoped to one week row at a time —
 *  a month grid wraps every 7 days, so there's no single flat strip to drag
 *  across the way TeamsView has; continuing a drag across the row wrap
 *  isn't supported; PresetPicker's own start/end date inputs cover that
 *  rarer case (see MyScheduleView). */
export function MonthCalendar({ monthStart, days, onDayClick, onRangeSelect, markers = [] }: MonthCalendarProps) {
  const [year, month] = monthStart.split("-").map(Number)
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1))
  // getUTCDay() is 0 = Sunday … 6 = Saturday; shift so 0 = Monday … 6 = Sunday
  // to get the number of leading blank cells in a Monday-first grid.
  const startWeekday = (firstOfMonth.getUTCDay() + 6) % 7
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()

  const dayByDate = Object.fromEntries(days.map((d) => [d.date, d]))

  const cells: (string | null)[] = [
    ...Array.from({ length: startWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => toDateString(new Date(Date.UTC(year, month - 1, i + 1)))),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

  // Clip each banded marker to the visible, tracked part of the month, so a
  // band's columns land only on real day cells. Each week row then gets its
  // full seven calendar dates (padding included) for MarkerBand's column math.
  const monthEnd = toDateString(new Date(Date.UTC(year, month, 0)))
  const visibleFrom = monthStart > SCHEDULE_START_DATE ? monthStart : SCHEDULE_START_DATE
  const bandMarkers = markers.flatMap((m) => {
    if (m.kind === "HOLIDAY" && m.observed) return []
    const start = toDateString(new Date(m.startDate))
    const end = toDateString(new Date(m.endDate))
    const from = start > visibleFrom ? start : visibleFrom
    const to = end < monthEnd ? end : monthEnd
    if (from > to) return []
    return [{ ...m, startDate: new Date(`${from}T00:00:00.000Z`), endDate: new Date(`${to}T00:00:00.000Z`) }]
  })
  const rowDates = (weekIdx: number) =>
    Array.from({ length: 7 }, (_, col) =>
      toDateString(new Date(Date.UTC(year, month - 1, 1 - startWeekday + weekIdx * 7 + col)))
    )

  const [drag, setDrag] = useState<DragState | null>(null)

  // A single window `mouseup` listener while dragging catches a release
  // outside the grid entirely — per-cell mouseup would miss that.
  useEffect(() => {
    if (!drag) return
    function onUp() {
      setDrag((d) => {
        if (d) {
          const lo = Math.min(d.startCol, d.endCol)
          const hi = Math.max(d.startCol, d.endCol)
          const dates = weeks[d.weekIdx].slice(lo, hi + 1).filter((date): date is string => date !== null)
          if (dates.length === 1) onDayClick(dates[0])
          else if (dates.length > 1) onRangeSelect(dates)
        }
        return null
      })
    }
    window.addEventListener("mouseup", onUp)
    return () => window.removeEventListener("mouseup", onUp)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- weeks is derived fresh each render from stable props
  }, [drag])

  function handleMouseDown(weekIdx: number, col: number) {
    setDrag({ weekIdx, startCol: col, endCol: col })
  }
  function handleMouseEnter(weekIdx: number, col: number) {
    setDrag((d) => (d && d.weekIdx === weekIdx ? { ...d, endCol: col } : d))
  }

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-7 gap-1 text-xs text-muted-foreground text-center">
        {WEEKDAY_HEADERS.map((h) => (
          <div key={h} className="py-1">
            {h}
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {weeks.map((week, weekIdx) => {
          const selectedRange =
            drag && drag.weekIdx === weekIdx ? [Math.min(drag.startCol, drag.endCol), Math.max(drag.startCol, drag.endCol)] : null
          return (
            <div key={weekIdx}>
              {bandMarkers.length > 0 && <MarkerBand weekDates={rowDates(weekIdx)} markers={bandMarkers} />}
              <div className="grid grid-cols-7 gap-1">
                {week.map((date, col) =>
                  date && isBeforeScheduleStart(date) ? (
                    // Issue #85: not tracked here — see the spreadsheet.
                    <div
                      key={date}
                      className="flex flex-col rounded-md border border-dashed bg-muted/30 p-1.5 text-xs h-16 text-muted-foreground"
                    >
                      <div className="font-medium shrink-0">{Number(date.slice(8))}</div>
                      <div className="mt-0.5 truncate">See spreadsheet</div>
                    </div>
                  ) : date ? (
                    <button
                      key={date}
                      type="button"
                      onMouseDown={() => handleMouseDown(weekIdx, col)}
                      onMouseEnter={() => handleMouseEnter(weekIdx, col)}
                      className={`flex flex-col rounded-md border p-1.5 text-left text-xs h-16 overflow-hidden hover:ring-2 hover:ring-ring transition-shadow ${
                        selectedRange !== null && col >= selectedRange[0] && col <= selectedRange[1] ? "ring-2 ring-ring" : ""
                      }`}
                    >
                      <div className="font-medium shrink-0">{Number(date.slice(8))}</div>
                      <div className="flex-1 min-h-0 mt-0.5">
                        <AvailabilityChip
                          day={dayByDate[date]}
                          note={dayByDate[date]?.note}
                          amNote={dayByDate[date]?.amNote}
                          pmNote={dayByDate[date]?.pmNote}
                          size="sm"
                        />
                      </div>
                    </button>
                  ) : (
                    <div key={`empty-${col}`} />
                  )
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

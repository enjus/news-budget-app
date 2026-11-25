"use client"

import { toDateString } from "@/lib/utils"
import { isBeforeScheduleStart, monthBandMarkers, SCHEDULE_START_DATE } from "@/lib/schedule"
import { AvailabilityChip } from "@/components/schedule/AvailabilityChip"
import { MarkerBand } from "@/components/schedule/MarkerBand"
import type { CalendarMarker } from "@prisma/client"
import type { MyScheduleDay } from "@/lib/hooks/useMySchedule"
import { useDragRange, onKeyboardActivate } from "@/lib/hooks/useDragRange"

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
  /** Calendar markers overlapping the month, banded above each week row
   *  they touch. Observed holidays are banded only where a day cell doesn't
   *  already show them (see monthBandMarkers()). */
  markers?: CalendarMarker[]
}

const WEEKDAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

/** Generic month grid, taking resolved days as a prop so it isn't hardwired
 *  to the "me" view — Phase 3's team/absence views reuse it. Markers get
 *  a MarkerBand above each week row they touch, clipped to the month (and
 *  to the schedule start) so a band never runs over blank padding or "See
 *  spreadsheet" cells. An observed holiday is usually skipped, since
 *  resolveDay() bakes it into each affected day (status "off", reason
 *  "holiday") and AvailabilityChip shows its label; it's banded only when
 *  some covered day doesn't show it (a regular day off, or an explicit
 *  availability entry), which monthBandMarkers() decides.
 *  Weeks are Monday–Sunday, matching the app's standard week (mondayOf(),
 *  the team schedule grid) — not JS's native Sunday-first getUTCDay().
 *
 *  Drag-to-select shares useDragRange with /schedule/teams' TeamsView,
 *  scoped to one week row at a time —
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

  // The visible, tracked part of the month. Each week row gets its full
  // seven calendar dates (padding included) for MarkerBand's column math,
  // and visibleRange clips bands back to real day cells.
  const visibleRange = {
    from: monthStart > SCHEDULE_START_DATE ? monthStart : SCHEDULE_START_DATE,
    to: toDateString(new Date(Date.UTC(year, month, 0))),
  }
  const bandMarkers = monthBandMarkers(markers, dayByDate, visibleRange.from, visibleRange.to)
  const rowDates = (weekIdx: number) =>
    Array.from({ length: 7 }, (_, col) =>
      toDateString(new Date(Date.UTC(year, month - 1, 1 - startWeekday + weekIdx * 7 + col)))
    )

  // Drag state, the window mouseup and stuck-drag handling live in
  // useDragRange (shared with the team grid); rows are week indexes here.
  const { begin, extend, selectedIn } = useDragRange<number>(({ key: weekIdx, start, end }) => {
    const dates = weeks[weekIdx]
      .slice(Math.min(start, end), Math.max(start, end) + 1)
      .filter((date): date is string => date !== null)
    if (dates.length === 1) onDayClick(dates[0])
    else if (dates.length > 1) onRangeSelect(dates)
  })

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
          const selectedRange = selectedIn(weekIdx)
          return (
            <div key={weekIdx}>
              {bandMarkers.length > 0 && <MarkerBand weekDates={rowDates(weekIdx)} markers={bandMarkers} visibleRange={visibleRange} />}
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
                      onMouseDown={(e) => begin(weekIdx, col, e)}
                      onMouseEnter={(e) => extend(weekIdx, col, e)}
                      onClick={onKeyboardActivate(() => onDayClick(date))}
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
                          shiftRoles={dayByDate[date]?.shiftRoles}
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

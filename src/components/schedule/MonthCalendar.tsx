"use client"

import { CalendarDays } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toDateString } from "@/lib/utils"
import { AvailabilityChip } from "@/components/schedule/AvailabilityChip"
import type { MyScheduleDay } from "@/lib/hooks/useMySchedule"
import type { CalendarMarker } from "@prisma/client"

interface MonthCalendarProps {
  /** First-of-month date, YYYY-MM-DD. */
  monthStart: string
  days: MyScheduleDay[]
  markers: CalendarMarker[]
  onDayClick: (date: string) => void
  onWeekClick: (weekDates: string[]) => void
}

const WEEKDAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

/** Generic month grid, taking resolved days/markers as props so it isn't
 *  hardwired to the "me" view — Phase 3's team/absence views reuse it.
 *  Weeks are Monday–Sunday, matching the app's standard week (mondayOf(),
 *  the team schedule grid) — not JS's native Sunday-first getUTCDay(). */
export function MonthCalendar({ monthStart, days, markers, onDayClick, onWeekClick }: MonthCalendarProps) {
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

  const holidayMarkers = markers.filter((m) => m.kind === "HOLIDAY")
  const blackoutMarkers = markers.filter((m) => m.kind === "BLACKOUT")

  return (
    <div className="space-y-1">
      {(holidayMarkers.length > 0 || blackoutMarkers.length > 0) && (
        <div className="flex flex-wrap gap-2 pb-1">
          {blackoutMarkers.map((m) => (
            <span key={m.id} className="text-xs rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground">
              {m.label}
            </span>
          ))}
        </div>
      )}
      <div className="grid grid-cols-7 gap-1 text-xs text-muted-foreground text-center">
        {WEEKDAY_HEADERS.map((h) => (
          <div key={h} className="py-1">
            {h}
          </div>
        ))}
      </div>
      <div className="space-y-1">
        {weeks.map((week, i) => (
          <div key={i} className="flex items-stretch gap-1">
            <div className="grid grid-cols-7 gap-1 flex-1">
              {week.map((date, j) =>
                date ? (
                  <button
                    key={date}
                    type="button"
                    onClick={() => onDayClick(date)}
                    className="flex flex-col rounded-md border p-1.5 text-left text-xs h-16 overflow-hidden hover:ring-2 hover:ring-ring transition-shadow"
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
                  <div key={`empty-${j}`} />
                )
              )}
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Edit week"
              className="shrink-0 self-center"
              onClick={() => onWeekClick(week.filter((d): d is string => d !== null))}
              disabled={week.every((d) => d === null)}
            >
              <CalendarDays className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}

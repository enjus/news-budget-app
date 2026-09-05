"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { MonthCalendar } from "@/components/schedule/MonthCalendar"
import { PresetPicker } from "@/components/schedule/PresetPicker"
import { WeekEditor } from "@/components/schedule/WeekEditor"
import { useMySchedule } from "@/lib/hooks/useMySchedule"
import { useCalendarMarkers } from "@/lib/hooks/useCalendarMarkers"
import { todayString, toDateString, dateOnly } from "@/lib/utils"

function monthBounds(monthStart: string): { start: string; end: string } {
  const [year, month] = monthStart.split("-").map(Number)
  const end = toDateString(new Date(Date.UTC(year, month, 0)))
  return { start: monthStart, end }
}

export function MyScheduleView() {
  const [monthStart, setMonthStart] = useState(() => `${todayString().slice(0, 7)}-01`)
  const { start, end } = monthBounds(monthStart)

  const { personId, days, isLoading, mutate } = useMySchedule(start, end)
  const { markers } = useCalendarMarkers({ start, end })

  const [pickerDate, setPickerDate] = useState<string | null>(null)
  const [editingWeek, setEditingWeek] = useState<string[] | null>(null)

  function shiftMonth(delta: number) {
    const [year, month] = monthStart.split("-").map(Number)
    setMonthStart(toDateString(new Date(Date.UTC(year, month - 1 + delta, 1))))
  }

  // isLoading covers the session itself still resolving, not just the SWR
  // fetch — otherwise a properly-linked account flashes "no linked staff
  // record" for a frame before the session finishes loading and personId
  // becomes available.
  if (!personId && isLoading) {
    return <p className="mx-auto max-w-lg px-4 py-16 text-sm text-muted-foreground">Loading…</p>
  }

  if (!personId) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <Card>
          <CardContent className="pt-6 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <TriangleAlert className="size-4 text-muted-foreground" />
              No linked staff record
            </div>
            <p className="text-sm text-muted-foreground">
              Your account isn't linked to a staff record yet, so there's no personal schedule to show. Ask an admin to
              link your account on the People page.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">My schedule</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" onClick={() => shiftMonth(-1)} aria-label="Previous month">
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setMonthStart(`${todayString().slice(0, 7)}-01`)}>
            Today
          </Button>
          <span className="text-sm font-medium w-28 text-center">
            {dateOnly(monthStart).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}
          </span>
          <Button variant="outline" size="icon-sm" onClick={() => shiftMonth(1)} aria-label="Next month">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <MonthCalendar
          monthStart={monthStart}
          days={days}
          markers={markers}
          onDayClick={setPickerDate}
          onWeekClick={setEditingWeek}
        />
      )}

      {pickerDate && (
        <PresetPicker
          open
          onOpenChange={(open) => !open && setPickerDate(null)}
          personId={personId}
          date={pickerDate}
          onSaved={() => mutate()}
        />
      )}

      {editingWeek && (
        <WeekEditor
          open
          onOpenChange={(open) => !open && setEditingWeek(null)}
          personId={personId}
          weekDates={editingWeek}
          resolvedDays={days}
          onSaved={() => mutate()}
        />
      )}
    </div>
  )
}

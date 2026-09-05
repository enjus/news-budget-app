"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { ShiftRoleSlot } from "@/components/schedule/ShiftRoleSlot"
import { SHIFT_ROLE_LABELS, SHIFT_ROLES, toDateString, dateOnly, todayString } from "@/lib/utils"
import type { ShiftDay, ShiftRosterPerson } from "@/lib/hooks/useShifts"

interface ShiftsViewProps {
  start: string
  end: string
  onRangeChange: (start: string, end: string) => void
  roster: ShiftRosterPerson[]
  days: ShiftDay[]
  isLoading: boolean
  onSaved: () => void
}

function addDays(dateStr: string, days: number): string {
  return toDateString(new Date(dateOnly(dateStr).getTime() + days * 24 * 60 * 60 * 1000))
}

function weekdayLabel(date: string): string {
  return new Date(`${date}T00:00:00.000Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })
}

export function ShiftsView({ start, end, onRangeChange, roster, days, isLoading, onSaved }: ShiftsViewProps) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold">Shifts</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => onRangeChange(todayString(), addDays(todayString(), 56))}>
            Next 8 weeks
          </Button>
          <Button variant="outline" size="sm" onClick={() => onRangeChange(todayString(), addDays(todayString(), 182))}>
            Next 6 months
          </Button>
        </div>
      </div>

      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1.5">
          <Label htmlFor="shifts-start">Start</Label>
          <Input
            id="shifts-start"
            type="date"
            className="text-base"
            value={start}
            onChange={(e) => onRangeChange(e.target.value, end)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="shifts-end">End</Label>
          <Input
            id="shifts-end"
            type="date"
            className="text-base"
            value={end}
            onChange={(e) => onRangeChange(start, e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : days.length === 0 ? (
        <p className="text-sm text-muted-foreground">No shift days in this range.</p>
      ) : (
        <div className="space-y-4">
          {days.map((day) => (
            <div key={day.date} className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center gap-2">
                <span className="font-medium">
                  {weekdayLabel(day.date)} {day.date.slice(5)}
                </span>
                {day.holiday && (
                  <Badge variant="secondary" title={day.holiday.label}>
                    {day.holiday.label}
                  </Badge>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {SHIFT_ROLES.map((role) => (
                  <ShiftRoleSlot
                    key={role}
                    date={day.date}
                    shiftRole={role}
                    roleLabel={SHIFT_ROLE_LABELS[role]}
                    assignments={day.roles[role] ?? []}
                    roster={roster}
                    onSaved={onSaved}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

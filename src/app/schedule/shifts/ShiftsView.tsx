"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { ShiftRoleSlot } from "@/components/schedule/ShiftRoleSlot"
import { SHIFT_ROLE_LABELS, SHIFT_ROLES, addDays, todayString, weekdayAbbrev, shortDate } from "@/lib/utils"
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

function emptyRoles(): Record<string, []> {
  return Object.fromEntries(SHIFT_ROLES.map((r) => [r, []]))
}

export function ShiftsView({ start, end, onRangeChange, roster, days, isLoading, onSaved }: ShiftsViewProps) {
  // Local-only placeholders for a shift day added directly by date (issue
  // #19 §6 extension — an ad-hoc coverage day like a weeknight protest,
  // which has no weekend/holiday basis of its own). A placeholder exists
  // purely so there's a row to add the first assignment to; once that
  // assignment is saved, the server starts returning the real day (see
  // mergeShiftDays()) and the effect below drops the now-redundant
  // placeholder.
  const [manualDates, setManualDates] = useState<string[]>([])
  const [newDate, setNewDate] = useState("")

  useEffect(() => {
    setManualDates((prev) => prev.filter((d) => !days.some((day) => day.date === d)))
  }, [days])

  const combinedDays = useMemo(() => {
    const existing = new Set(days.map((d) => d.date))
    const placeholders: ShiftDay[] = manualDates
      .filter((d) => !existing.has(d))
      .map((date) => ({ date, holiday: null, adHoc: true, roles: emptyRoles() }))
    return [...days, ...placeholders].sort((a, b) => a.date.localeCompare(b.date))
  }, [days, manualDates])

  function handleAddDay() {
    if (!newDate) return
    if (newDate < start || newDate > end) {
      toast.error("Pick a date within the range above (or widen it first).")
      return
    }
    setManualDates((prev) => (prev.includes(newDate) ? prev : [...prev, newDate]))
    setNewDate("")
  }

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
        <div className="space-y-1.5">
          <Label htmlFor="shifts-add-day">Add a shift day</Label>
          <div className="flex gap-2">
            <Input
              id="shifts-add-day"
              type="date"
              className="text-base"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
            />
            <Button variant="outline" onClick={handleAddDay} disabled={!newDate}>
              Add
            </Button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : combinedDays.length === 0 ? (
        <p className="text-sm text-muted-foreground">No shift days in this range.</p>
      ) : (
        <div className="space-y-4">
          {combinedDays.map((day) => (
            <div key={day.date} className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center gap-2">
                <span className="font-medium">
                  {weekdayAbbrev(day.date)} {shortDate(day.date)}
                </span>
                {day.holiday && (
                  <Badge variant="secondary" title={day.holiday.label}>
                    {day.holiday.label}
                  </Badge>
                )}
                {day.adHoc && (
                  <Badge variant="outline" title="Added directly — not a standing weekend or holiday">
                    Added
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

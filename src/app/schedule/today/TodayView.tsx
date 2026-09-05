"use client"

import { useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, PartyPopper, AlertTriangle, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { dateOnly, toDateString, todayString, SHIFT_ROLES, SHIFT_ROLE_LABELS } from "@/lib/utils"
import { resolvedSegmentLabel } from "@/components/schedule/AvailabilityChip"
import { groupPeople, isObservedHoliday, type GroupedDay } from "./groupPeople"
import type { DaySchedulePerson, DayShiftAssignment } from "@/lib/hooks/useDaySchedule"
import type { CalendarMarker } from "@prisma/client"

interface TodayViewProps {
  date: string
  onDateChange: (date: string) => void
  people: DaySchedulePerson[]
  teams: { id: string; name: string }[]
  markers: CalendarMarker[]
  shifts: DayShiftAssignment[]
  isLoading: boolean
}

/** Anyone with a shift role on this date — issue #19 extension: filled shift
 *  roles are worth surfacing on the absence board regardless of whether the
 *  day is a holiday, a weekend, or an ad-hoc coverage day; unfilled roles
 *  stay a /schedule/shifts-only concern. */
function ShiftSection({ shifts }: { shifts: DayShiftAssignment[] }) {
  if (shifts.length === 0) return null
  const sorted = [...shifts].sort(
    (a, b) => SHIFT_ROLES.indexOf(a.shiftRole) - SHIFT_ROLES.indexOf(b.shiftRole)
  )
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium">On shift ({shifts.length})</h2>
      <div className="space-y-1.5">
        {sorted.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
            <div className="flex items-center gap-1.5 min-w-0">
              {s.conflict && (
                <span title={s.conflict.message}>
                  {s.conflict.severity === "warning" ? (
                    <AlertTriangle className="size-3.5 shrink-0 text-red-500" />
                  ) : (
                    <Info className="size-3.5 shrink-0 text-amber-500" />
                  )}
                </span>
              )}
              <span className="text-sm font-medium truncate">{s.name}</span>
            </div>
            <div className="text-right shrink-0 max-w-[55%]">
              <p className="text-xs text-muted-foreground">{SHIFT_ROLE_LABELS[s.shiftRole] ?? s.shiftRole}</p>
              {s.note && (
                <p className="text-xs text-muted-foreground truncate" title={s.note}>
                  {s.note}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function shiftDate(date: string, deltaDays: number): string {
  return toDateString(new Date(dateOnly(date).getTime() + deltaDays * 24 * 60 * 60 * 1000))
}

function noteFor(person: DaySchedulePerson): string | null {
  if (person.resolved.split) {
    const parts = [person.amNote && `AM: ${person.amNote}`, person.pmNote && `PM: ${person.pmNote}`].filter(Boolean)
    return parts.length > 0 ? parts.join(" · ") : null
  }
  return person.note
}

/** "AM: Out · PM: Working" — which half is worked and which isn't is the
 *  one thing a half-day entry exists to communicate, so it needs its own
 *  line rather than being inferable only from a free-text note. */
function splitStatusLabel(person: DaySchedulePerson): string | null {
  if (!person.resolved.split) return null
  return `AM: ${resolvedSegmentLabel(person.resolved.am)} · PM: ${resolvedSegmentLabel(person.resolved.pm)}`
}

function PersonRow({ person, teamsById }: { person: DaySchedulePerson; teamsById: Map<string, string> }) {
  const note = noteFor(person)
  const splitStatus = splitStatusLabel(person)
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">{person.name}</div>
        {person.teamIds.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {person.teamIds.map((id) => (
              <Badge key={id} variant="outline" className="text-[10px]">
                {teamsById.get(id) ?? id}
              </Badge>
            ))}
          </div>
        )}
      </div>
      <div className="text-right shrink-0 max-w-[55%]">
        {splitStatus && <p className="text-xs font-medium">{splitStatus}</p>}
        {note && <p className="text-xs text-muted-foreground truncate" title={note}>{note}</p>}
      </div>
    </div>
  )
}

function Section({ title, people, teamsById, muted, collapsible }: {
  title: string
  people: DaySchedulePerson[]
  teamsById: Map<string, string>
  muted?: boolean
  collapsible?: boolean
}) {
  const [open, setOpen] = useState(!collapsible)
  if (people.length === 0) return null

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => collapsible && setOpen((o) => !o)}
        className={`text-sm font-medium ${muted ? "text-muted-foreground" : ""} ${collapsible ? "hover:underline" : ""}`}
      >
        {title} ({people.length}){collapsible ? (open ? " — hide" : " — show") : ""}
      </button>
      {open && (
        <div className={`space-y-1.5 ${muted ? "opacity-70" : ""}`}>
          {people.map((p) => (
            <PersonRow key={p.id} person={p} teamsById={teamsById} />
          ))}
        </div>
      )}
    </div>
  )
}

export function TodayView({ date, onDateChange, people, teams, markers, shifts, isLoading }: TodayViewProps) {
  const teamsById = useMemo(() => new Map(teams.map((t) => [t.id, t.name])), [teams])
  const holiday = useMemo(() => isObservedHoliday(date, markers), [date, markers])
  const grouped: GroupedDay = useMemo(() => groupPeople(people, holiday !== null), [people, holiday])

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold">Today</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" onClick={() => onDateChange(shiftDate(date, -1))} aria-label="Previous day">
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => onDateChange(todayString())}>
            Today
          </Button>
          <Input
            type="date"
            value={date}
            onChange={(e) => e.target.value && onDateChange(e.target.value)}
            className="w-40"
          />
          <Button variant="outline" size="icon-sm" onClick={() => onDateChange(shiftDate(date, 1))} aria-label="Next day">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {!isLoading && <ShiftSection shifts={shifts} />}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : holiday ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg border bg-violet-50 dark:bg-violet-950/30 px-4 py-3 text-sm">
            <PartyPopper className="size-4 text-violet-600 dark:text-violet-400 shrink-0" />
            <span>
              <strong>{holiday.label}</strong> — newsroom holiday. Showing who&apos;s working.
            </span>
          </div>
          <Section title="Working" people={grouped.workingOnHoliday} teamsById={teamsById} />
          {grouped.workingOnHoliday.length === 0 && (
            <p className="text-sm text-muted-foreground">Nobody is scheduled to work today.</p>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            {grouped.out.length} out · {grouped.halfDay.length} half {grouped.halfDay.length === 1 ? "day" : "days"} ·{" "}
            {grouped.unavailable.length} unavailable · {grouped.regularlyOff.length} regularly off ·{" "}
            {people.length} on the roster
          </p>
          <Section title="Out" people={grouped.out} teamsById={teamsById} />
          <Section title="Half day" people={grouped.halfDay} teamsById={teamsById} />
          <Section title="Unavailable" people={grouped.unavailable} teamsById={teamsById} />
          <Section title="Regularly off" people={grouped.regularlyOff} teamsById={teamsById} muted collapsible />
          {grouped.out.length === 0 &&
            grouped.halfDay.length === 0 &&
            grouped.unavailable.length === 0 &&
            grouped.regularlyOff.length === 0 && (
              <p className="text-sm text-muted-foreground">Nobody is out today.</p>
            )}
        </div>
      )}
    </div>
  )
}

"use client"

import { useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, PartyPopper } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { dateOnly, toDateString, todayString } from "@/lib/utils"
import { groupPeople, isObservedHoliday, type GroupedDay } from "./groupPeople"
import type { DaySchedulePerson } from "@/lib/hooks/useDaySchedule"
import type { CalendarMarker } from "@prisma/client"

interface TodayViewProps {
  date: string
  onDateChange: (date: string) => void
  people: DaySchedulePerson[]
  teams: { id: string; name: string }[]
  markers: CalendarMarker[]
  isLoading: boolean
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

function PersonRow({ person, teamsById }: { person: DaySchedulePerson; teamsById: Map<string, string> }) {
  const note = noteFor(person)
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
      {note && <p className="text-xs text-muted-foreground text-right max-w-[50%] truncate" title={note}>{note}</p>}
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

export function TodayView({ date, onDateChange, people, teams, markers, isLoading }: TodayViewProps) {
  const teamsById = useMemo(() => new Map(teams.map((t) => [t.id, t.name])), [teams])
  const holiday = useMemo(() => isObservedHoliday(date, markers), [date, markers])
  const grouped: GroupedDay = useMemo(() => groupPeople(people, holiday !== null), [people, holiday])

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold">Who&apos;s out today</h1>
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

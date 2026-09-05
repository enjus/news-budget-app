"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { AvailabilityChip } from "@/components/schedule/AvailabilityChip"
import { MarkerBand } from "@/components/schedule/MarkerBand"
import { WeekEditor } from "@/components/schedule/WeekEditor"
import { PresetPicker } from "@/components/schedule/PresetPicker"
import { dateOnly, toDateString, mondayOf, todayString, weekdayAbbrev } from "@/lib/utils"
import type { WeekSchedulePerson } from "@/lib/hooks/useWeekSchedule"
import type { CalendarMarker } from "@prisma/client"

interface TeamsViewProps {
  weekStart: string
  onWeekStartChange: (weekStart: string) => void
  people: WeekSchedulePerson[]
  teams: { id: string; name: string }[]
  markers: CalendarMarker[]
  isLoading: boolean
  onSaved: () => void
}

function weekDatesFrom(weekStart: string): string[] {
  const start = dateOnly(weekStart)
  return Array.from({ length: 7 }, (_, i) => toDateString(new Date(start.getTime() + i * 24 * 60 * 60 * 1000)))
}

/** Row has no explicit override anywhere in the displayed range — used by
 *  the "show only exceptions" filter. */
function isBaseline(day: WeekSchedulePerson["days"][number]): boolean {
  if (day.split) return false
  return (day.status === "working" && day.source === "pattern") || (day.status === "off" && day.reason === "regular")
}

/** "8 staff · 2 out Wed" — pure presentational aggregation over already
 *  resolved data, not resolution logic, so it stays here rather than in
 *  src/lib/schedule.ts. */
export function teamHeaderSummary(people: WeekSchedulePerson[], weekDates: string[]): string {
  const outCounts = weekDates.map((date, i) => {
    const n = people.filter((p) => {
      const d = p.days[i]
      return d && !d.split && d.status === "off" && d.reason === "availability"
    }).length
    return { date, n }
  })
  const label = (date: string) =>
    new Date(`${date}T00:00:00.000Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })
  const parts = outCounts.filter((c) => c.n > 0).map((c) => `${c.n} out ${label(c.date)}`)
  return `${people.length} staff${parts.length > 0 ? ` · ${parts.join(", ")}` : ""}`
}

interface DragState {
  personId: string
  startIdx: number
  endIdx: number
}

function DayCell({
  day,
  selected,
  onMouseDown,
  onMouseEnter,
}: {
  day: WeekSchedulePerson["days"][number] | undefined
  selected: boolean
  onMouseDown: () => void
  onMouseEnter: () => void
}) {
  return (
    <button
      type="button"
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      className={`rounded min-h-9 ${selected ? "ring-2 ring-ring" : ""}`}
    >
      <AvailabilityChip day={day} inBlackout={day?.inBlackout ?? false} size="sm" />
    </button>
  )
}

function PersonRow({
  person,
  columns,
  drag,
  onCellMouseDown,
  onCellMouseEnter,
  onEditWeek,
}: {
  person: WeekSchedulePerson
  columns: number[]
  drag: DragState | null
  onCellMouseDown: (personId: string, idx: number) => void
  onCellMouseEnter: (personId: string, idx: number) => void
  onEditWeek: (personId: string) => void
}) {
  const selectedRange =
    drag && drag.personId === person.id
      ? [Math.min(drag.startIdx, drag.endIdx), Math.max(drag.startIdx, drag.endIdx)]
      : null

  return (
    <div className="flex items-stretch gap-2">
      <div className="w-40 shrink-0 flex items-center justify-between gap-1 text-sm">
        <span className="truncate">{person.name}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Edit ${person.name}'s week`}
          className="shrink-0"
          onClick={() => onEditWeek(person.id)}
        >
          <CalendarDays className="size-3.5" />
        </Button>
      </div>
      <div className="grid gap-1 flex-1" style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}>
        {columns.map((idx) => (
          <DayCell
            key={idx}
            day={person.days[idx]}
            selected={selectedRange !== null && idx >= selectedRange[0] && idx <= selectedRange[1]}
            onMouseDown={() => onCellMouseDown(person.id, idx)}
            onMouseEnter={() => onCellMouseEnter(person.id, idx)}
          />
        ))}
      </div>
    </div>
  )
}

export function TeamsView({ weekStart, onWeekStartChange, people, teams, markers, isLoading, onSaved }: TeamsViewProps) {
  const weekDates = useMemo(() => weekDatesFrom(weekStart), [weekStart])

  const [viewMode, setViewMode] = useState<"week" | "day">("week")
  const [dayIndex, setDayIndex] = useState(0)
  const [showExceptionsOnly, setShowExceptionsOnly] = useState(false)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [rangePicker, setRangePicker] = useState<{ personId: string; dates: string[] } | null>(null)
  const [editingWeekFor, setEditingWeekFor] = useState<string | null>(null)

  const columns = viewMode === "week" ? weekDates.map((_, i) => i) : [dayIndex]

  // A single window `mouseup` listener while dragging catches a release
  // outside the grid entirely — per-cell mouseup would miss that.
  useEffect(() => {
    if (!drag) return
    function onUp() {
      setDrag((d) => {
        if (d) {
          const lo = Math.min(d.startIdx, d.endIdx)
          const hi = Math.max(d.startIdx, d.endIdx)
          setRangePicker({ personId: d.personId, dates: weekDates.slice(lo, hi + 1) })
        }
        return null
      })
    }
    window.addEventListener("mouseup", onUp)
    return () => window.removeEventListener("mouseup", onUp)
  }, [drag, weekDates])

  function handleCellMouseDown(personId: string, idx: number) {
    setDrag({ personId, startIdx: idx, endIdx: idx })
  }
  function handleCellMouseEnter(personId: string, idx: number) {
    setDrag((d) => (d && d.personId === personId ? { ...d, endIdx: idx } : d))
  }

  const filteredPeople = showExceptionsOnly
    ? people.filter((p) => columns.some((i) => !isBaseline(p.days[i])))
    : people

  const noTeam = filteredPeople.filter((p) => p.teamIds.length === 0)

  const editingPerson = editingWeekFor ? people.find((p) => p.id === editingWeekFor) : undefined

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold">Team schedule</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onWeekStartChange(toDateString(new Date(dateOnly(weekStart).getTime() - 7 * 24 * 60 * 60 * 1000)))}
            aria-label="Previous week"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => onWeekStartChange(mondayOf(todayString()))}>
            This week
          </Button>
          <span className="text-sm font-medium w-32 text-center">
            {weekDates[0].slice(5)} – {weekDates[6].slice(5)}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onWeekStartChange(toDateString(new Date(dateOnly(weekStart).getTime() + 7 * 24 * 60 * 60 * 1000)))}
            aria-label="Next week"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Checkbox
            id="exceptions-only"
            checked={showExceptionsOnly}
            onCheckedChange={(checked) => setShowExceptionsOnly(checked === true)}
          />
          <Label htmlFor="exceptions-only" className="font-normal text-sm">
            Show only exceptions
          </Label>
        </div>
        <div className="flex items-center gap-2">
          {viewMode === "day" && (
            <Select value={String(dayIndex)} onValueChange={(v) => setDayIndex(Number(v))}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {weekDates.map((d, i) => (
                  <SelectItem key={d} value={String(i)}>
                    {weekdayAbbrev(d)} {d.slice(5)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={viewMode} onValueChange={(v) => setViewMode(v as "week" | "day")}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Week</SelectItem>
              <SelectItem value="day">Single day</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-stretch gap-2">
            <div className="w-40 shrink-0" />
            <div className="flex-1">
              <MarkerBand weekDates={columns.map((i) => weekDates[i])} markers={markers} />
              <div className="grid gap-1 text-xs text-muted-foreground text-center" style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}>
                {columns.map((i) => (
                  <div key={i}>{weekdayAbbrev(weekDates[i])} {weekDates[i].slice(5)}</div>
                ))}
              </div>
            </div>
          </div>

          {teams.map((team) => {
            const teamPeople = filteredPeople.filter((p) => p.teamIds.includes(team.id))
            if (teamPeople.length === 0) return null
            return (
              <div key={team.id} className="space-y-2">
                <h2 className="text-sm font-semibold">
                  {team.name} — {teamHeaderSummary(teamPeople, columns.map((i) => weekDates[i]))}
                </h2>
                <div className="space-y-1.5">
                  {teamPeople.map((p) => (
                    <PersonRow
                      key={p.id}
                      person={p}
                      columns={columns}
                      drag={drag}
                      onCellMouseDown={handleCellMouseDown}
                      onCellMouseEnter={handleCellMouseEnter}
                      onEditWeek={setEditingWeekFor}
                    />
                  ))}
                </div>
              </div>
            )
          })}

          {noTeam.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold">No team — {teamHeaderSummary(noTeam, columns.map((i) => weekDates[i]))}</h2>
              <div className="space-y-1.5">
                {noTeam.map((p) => (
                  <PersonRow
                    key={p.id}
                    person={p}
                    columns={columns}
                    drag={drag}
                    onCellMouseDown={handleCellMouseDown}
                    onCellMouseEnter={handleCellMouseEnter}
                    onEditWeek={setEditingWeekFor}
                  />
                ))}
              </div>
            </div>
          )}

          {filteredPeople.length === 0 && (
            <p className="text-sm text-muted-foreground">No one matches the current filter.</p>
          )}
        </div>
      )}

      {rangePicker && (
        <PresetPicker
          open
          onOpenChange={(open) => !open && setRangePicker(null)}
          personId={rangePicker.personId}
          date={rangePicker.dates[0]}
          initialEndDate={rangePicker.dates[rangePicker.dates.length - 1]}
          // Only meaningful for a single-day selection — PresetPicker's own
          // "Revert to default" gate already requires startDate === endDate,
          // so a multi-day drag range just never sees this. Without it, a
          // single-cell click on the team grid never passed the already-
          // resolved day back to the picker, so its revert button (which
          // needs to know there's something to revert to baseline) could
          // never appear here even though /schedule/me's picker has always
          // had it.
          initialDay={
            rangePicker.dates.length === 1
              ? people.find((p) => p.id === rangePicker.personId)?.days.find((d) => d.date === rangePicker.dates[0])
              : undefined
          }
          onSaved={() => {
            onSaved()
            setRangePicker(null)
          }}
        />
      )}

      {editingPerson && (
        <WeekEditor
          open
          onOpenChange={(open) => !open && setEditingWeekFor(null)}
          personId={editingPerson.id}
          weekDates={weekDates}
          resolvedDays={editingPerson.days}
          onSaved={onSaved}
        />
      )}
    </div>
  )
}

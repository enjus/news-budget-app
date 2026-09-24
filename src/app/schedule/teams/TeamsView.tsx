"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { AvailabilityChip } from "@/components/schedule/AvailabilityChip"
import { MarkerBand } from "@/components/schedule/MarkerBand"
import { WeekEditor } from "@/components/schedule/WeekEditor"
import { PresetPicker } from "@/components/schedule/PresetPicker"
import { dateOnly, toDateString, mondayOf, todayString, weekdayAbbrev, shortDate } from "@/lib/utils"
import type { WeekSchedulePerson } from "@/lib/hooks/useWeekSchedule"
import type { CalendarMarker } from "@prisma/client"

export type TeamsViewMode = "week" | "day" | "month"

interface TeamsViewProps {
  viewMode: TeamsViewMode
  onViewModeChange: (mode: TeamsViewMode) => void
  /** Any date inside the displayed week/month — the view derives its window
   *  from this, so switching modes keeps you in roughly the same place. */
  anchor: string
  onAnchorChange: (anchor: string) => void
  people: WeekSchedulePerson[]
  teams: { id: string; name: string }[]
  markers: CalendarMarker[]
  isLoading: boolean
  onSaved: () => void
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Min width of one day column in Month view — wide enough for a chip label
 *  and a "Wed 9/23" header; the grid scrolls horizontally past that. */
const MONTH_COL_REM = 4

function datesBetween(start: string, end: string): string[] {
  const out: string[] = []
  for (let t = dateOnly(start).getTime(); t <= dateOnly(end).getTime(); t += DAY_MS) {
    out.push(toDateString(new Date(t)))
  }
  return out
}

function firstOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`
}

function addMonths(monthStart: string, n: number): string {
  const [y, m] = monthStart.split("-").map(Number)
  return toDateString(new Date(Date.UTC(y, m - 1 + n, 1)))
}

function lastOfMonth(date: string): string {
  const [y, m] = date.split("-").map(Number)
  return toDateString(new Date(Date.UTC(y, m, 0)))
}

/** The fetch window for a mode + anchor: the Monday-Sunday week for Week and
 *  Single day, the full calendar month for Month. */
export function visibleRange(mode: TeamsViewMode, anchor: string): { start: string; end: string } {
  if (mode === "month") return { start: firstOfMonth(anchor), end: lastOfMonth(anchor) }
  const start = mondayOf(anchor)
  return { start, end: toDateString(new Date(dateOnly(start).getTime() + 6 * DAY_MS)) }
}

function monthLabel(date: string): string {
  return dateOnly(date).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
}

/** Row has no explicit override anywhere in the displayed range — used by
 *  the "show only exceptions" filter. */
function isBaseline(day: WeekSchedulePerson["days"][number]): boolean {
  if (day.split) return false
  return (day.status === "working" && day.source === "pattern") || (day.status === "off" && day.reason === "regular")
}

/** "2 out Wed" — the out-count exceptions only, not the team's headcount
 *  (that's redundant with the row count below it). Pure presentational
 *  aggregation over already resolved data, not resolution logic, so it
 *  stays here rather than in src/lib/schedule.ts. Empty string when nobody
 *  in the group is out. `columns` are indexes into `weekDates` (and each
 *  person's `days`) — needed because Single day shows one column that isn't
 *  index 0. Only meaningful at week scale, so Month view skips it. */
export function teamHeaderSummary(people: WeekSchedulePerson[], weekDates: string[], columns: number[]): string {
  const outCounts = columns.map((i) => {
    const date = weekDates[i]
    const n = people.filter((p) => {
      const d = p.days[i]
      return d && !d.split && d.status === "off" && d.reason === "availability"
    }).length
    return { date, n }
  })
  const parts = outCounts.filter((c) => c.n > 0).map((c) => `${c.n} out ${weekdayAbbrev(c.date)}`)
  return parts.join(", ")
}

function isEditorOf(person: WeekSchedulePerson, teamId: string): boolean {
  return person.teamRoles.some((tr) => tr.teamId === teamId && tr.role === "EDITOR")
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
      className={`flex rounded border border-border/60 min-h-9 overflow-hidden ${selected ? "ring-2 ring-ring" : ""}`}
    >
      <AvailabilityChip
        day={day}
        inBlackout={day?.inBlackout ?? false}
        note={day?.note}
        amNote={day?.amNote}
        pmNote={day?.pmNote}
        size="sm"
        className="flex-1 min-w-0"
      />
    </button>
  )
}

function PersonRow({
  person,
  columns,
  gridTemplate,
  drag,
  onCellMouseDown,
  onCellMouseEnter,
  onEditWeek,
}: {
  person: WeekSchedulePerson
  columns: number[]
  gridTemplate: string
  drag: DragState | null
  onCellMouseDown: (personId: string, idx: number) => void
  onCellMouseEnter: (personId: string, idx: number) => void
  /** Omitted in Month view — WeekEditor edits one 7-day week, so there's no
   *  single week for the row's button to open. */
  onEditWeek?: (personId: string) => void
}) {
  const selectedRange =
    drag && drag.personId === person.id
      ? [Math.min(drag.startIdx, drag.endIdx), Math.max(drag.startIdx, drag.endIdx)]
      : null

  return (
    <div className="flex items-stretch gap-2">
      <div className="sticky left-0 z-10 bg-background w-40 shrink-0 flex items-center justify-between gap-1 text-sm">
        <span className="truncate">{person.name}</span>
        {onEditWeek && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Edit ${person.name}'s week`}
            className="shrink-0"
            onClick={() => onEditWeek(person.id)}
          >
            <CalendarDays className="size-3.5" />
          </Button>
        )}
      </div>
      <div className="grid gap-1 flex-1" style={{ gridTemplateColumns: gridTemplate }}>
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

export function TeamsView({
  viewMode,
  onViewModeChange,
  anchor,
  onAnchorChange,
  people,
  teams,
  markers,
  isLoading,
  onSaved,
}: TeamsViewProps) {
  const isMonth = viewMode === "month"
  // Every date the grid can show: the week for Week/Single day, the whole
  // month for Month. Column indexes below are indexes into this array.
  const weekDates = useMemo(() => {
    const { start, end } = visibleRange(viewMode, anchor)
    return datesBetween(start, end)
  }, [viewMode, anchor])

  const [dayIndex, setDayIndex] = useState(0)
  const [showExceptionsOnly, setShowExceptionsOnly] = useState(false)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [rangePicker, setRangePicker] = useState<{ personId: string; dates: string[] } | null>(null)
  const [editingWeekFor, setEditingWeekFor] = useState<string | null>(null)

  const columns = viewMode === "day" ? [dayIndex] : weekDates.map((_, i) => i)
  const gridTemplate = isMonth
    ? `repeat(${columns.length}, minmax(${MONTH_COL_REM}rem, 1fr))`
    : `repeat(${columns.length}, 1fr)`
  // Name column (w-40) + gap-2 + day columns + their gap-1 gutters — the
  // floor that makes Month scroll sideways instead of squeezing cells.
  const monthMinWidth = `${10.5 + columns.length * (MONTH_COL_REM + 0.25) - 0.25}rem`

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
  const noTeamSummary = isMonth ? "" : teamHeaderSummary(noTeam, weekDates, columns)

  // Prev/next: a week at a time, or a calendar month in Month view.
  function stepAnchor(dir: 1 | -1): string {
    if (isMonth) return addMonths(firstOfMonth(weekDates[0]), dir)
    return toDateString(new Date(dateOnly(weekDates[0]).getTime() + dir * 7 * DAY_MS))
  }

  const editingPerson = editingWeekFor ? people.find((p) => p.id === editingWeekFor) : undefined

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold">Team schedule</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onAnchorChange(stepAnchor(-1))}
            aria-label={isMonth ? "Previous month" : "Previous week"}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => onAnchorChange(todayString())}>
            {isMonth ? "This month" : "This week"}
          </Button>
          <span className="text-sm font-medium w-32 text-center">
            {isMonth ? monthLabel(weekDates[0]) : `${shortDate(weekDates[0])} – ${shortDate(weekDates[6])}`}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onAnchorChange(stepAnchor(1))}
            aria-label={isMonth ? "Next month" : "Next week"}
          >
            <ChevronRight className="size-4" />
          </Button>
          {/* Jumps straight to the week containing any picked date — the
             prev/next steppers alone take too many clicks to reach a
             far-future planned absence. */}
          <Input
            type="date"
            aria-label={isMonth ? "Jump to month" : "Jump to week"}
            className="w-40"
            value={weekDates[0]}
            onChange={(e) => e.target.value && onAnchorChange(e.target.value)}
          />
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
                    {weekdayAbbrev(d)} {shortDate(d)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={viewMode} onValueChange={(v) => onViewModeChange(v as TeamsViewMode)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Week</SelectItem>
              <SelectItem value="day">Single day</SelectItem>
              <SelectItem value="month">Month</SelectItem>
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
        // Month view is 28-31 day columns: the grid keeps a fixed floor width
        // and this wrapper scrolls it sideways, with the name column pinned.
        <div className={isMonth ? "overflow-x-auto pb-2" : undefined}>
        <div className="space-y-6" style={isMonth ? { minWidth: monthMinWidth } : undefined}>
          <div className="flex items-stretch gap-2">
            <div className="sticky left-0 z-10 bg-background w-40 shrink-0" />
            <div className="flex-1">
              <MarkerBand weekDates={columns.map((i) => weekDates[i])} markers={markers} columnTemplate={gridTemplate} />
              <div className="grid gap-1 text-xs text-muted-foreground text-center" style={{ gridTemplateColumns: gridTemplate }}>
                {columns.map((i) => (
                  <div key={i} className="rounded border border-border/60 py-1">
                    {weekdayAbbrev(weekDates[i])} {shortDate(weekDates[i])}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {teams.map((team) => {
            // Editors surface first for at-a-glance "who's in charge here";
            // within each group, order stays whatever filteredPeople already
            // has it in (name-sorted, from the roster query) — a plain
            // .sort() would be unstable-safe here anyway, but relying on
            // Array.prototype.sort's stability keeps it a one-line partition
            // rather than a second name comparison.
            const teamPeople = filteredPeople
              .filter((p) => p.teamIds.includes(team.id))
              .sort((a, b) => Number(isEditorOf(b, team.id)) - Number(isEditorOf(a, team.id)))
            if (teamPeople.length === 0) return null
            const summary = isMonth ? "" : teamHeaderSummary(teamPeople, weekDates, columns)
            return (
              <div key={team.id} className="space-y-2">
                <h2 className="sticky left-0 w-fit text-sm font-semibold">
                  {team.name}
                  {summary && ` — ${summary}`}
                </h2>
                <div className="space-y-1.5">
                  {teamPeople.map((p) => (
                    <PersonRow
                      key={p.id}
                      person={p}
                      columns={columns}
                      gridTemplate={gridTemplate}
                      drag={drag}
                      onCellMouseDown={handleCellMouseDown}
                      onCellMouseEnter={handleCellMouseEnter}
                      onEditWeek={isMonth ? undefined : setEditingWeekFor}
                    />
                  ))}
                </div>
              </div>
            )
          })}

          {noTeam.length > 0 && (
            <div className="space-y-2">
              <h2 className="sticky left-0 w-fit text-sm font-semibold">
                No team
                {noTeamSummary && ` — ${noTeamSummary}`}
              </h2>
              <div className="space-y-1.5">
                {noTeam.map((p) => (
                  <PersonRow
                    key={p.id}
                    person={p}
                    columns={columns}
                    gridTemplate={gridTemplate}
                    drag={drag}
                    onCellMouseDown={handleCellMouseDown}
                    onCellMouseEnter={handleCellMouseEnter}
                    onEditWeek={isMonth ? undefined : setEditingWeekFor}
                  />
                ))}
              </div>
            </div>
          )}

          {filteredPeople.length === 0 && (
            <p className="text-sm text-muted-foreground">No one matches the current filter.</p>
          )}
        </div>
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

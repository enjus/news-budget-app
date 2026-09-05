// Staffing schedule resolution logic (Phase 1 of issue #19; write-side
// helpers below added in Phase 2).
//
// resolveDay() is the single most important function in the staffing
// schedule feature: every view that shows whether someone is working on a
// given day goes through it, so its precedence order and date-arithmetic
// have to be right once, here, rather than reimplemented per-view.

import { toDateString } from "./utils"

/** Common shape of a HOLIDAY-checkable marker, loose enough to cover both
 *  server-side markers (Date fields) and markers as they arrive over the
 *  wire (JSON-serialized ISO strings) — see isoDateOnly()'s comment in
 *  utils.ts for why the latter happens. */
interface HolidayMarkerLike {
  kind: string
  observed: boolean
  label: string
  startDate: string | Date
  endDate: string | Date
}

function markerDateStr(value: string | Date): string {
  return typeof value === "string" ? value.slice(0, 10) : toDateString(value)
}

/** Whether `dateStr` falls within an observed HOLIDAY marker's inclusive
 *  range. The one implementation shared by resolveFromPattern (server-side
 *  day resolution), shiftDaysInWindow (Phase 4 shift-day derivation), and
 *  the absence board's holiday banner (src/app/schedule/today/groupPeople.ts)
 *  — previously three independent copies of the same "HOLIDAY, observed,
 *  inclusive both ends" check, which could drift. */
export function findObservedHoliday<T extends HolidayMarkerLike>(dateStr: string, markers: T[]): T | undefined {
  return markers.find(
    (m) => m.kind === "HOLIDAY" && m.observed && markerDateStr(m.startDate) <= dateStr && dateStr <= markerDateStr(m.endDate)
  )
}

/**
 * Local (non-Prisma) shape for an explicit availability override on one date.
 * Routes map real `Availability` rows into this shape — `{date:
 * toDateString(row.date), segment: row.segment, status: row.status}` —
 * before calling resolveDay(); it isn't the Prisma payload type directly
 * because `date` here is the wire-format string, not a `Date`.
 *
 * A date can carry either one FULL_DAY entry or up to two half entries
 * (MORNING + AFTERNOON) — never both a FULL_DAY entry and a half entry for
 * the same date. That invariant is enforced at write time by the API
 * (see the half-day-collision-clearing logic in the availability routes),
 * not here — resolveDay() degrades sensibly even if it's ever violated
 * (see the "FULL_DAY entry takes precedence" test case).
 */
export interface AvailabilityEntry {
  /** "YYYY-MM-DD" */
  date: string
  segment: string // FULL_DAY | MORNING | AFTERNOON
  status: string
}

export interface ResolveDayWorkSchedule {
  weekday: number // 0 = Sunday … 6 = Saturday
  segment: string // FULL_DAY | OFF
}

export interface ResolveDayMarker {
  id: string
  kind: string // HOLIDAY | BLACKOUT | NOTE
  label: string
  startDate: Date
  endDate: Date
  observed: boolean
}

export type ResolvedSegment =
  | { status: "off"; reason: "regular" }
  | { status: "off"; reason: "holiday"; markerId: string; markerLabel: string }
  | { status: "off"; reason: "availability"; source: AvailabilityEntry }
  | { status: "unavailable"; source: AvailabilityEntry }
  | { status: "working"; source: "availability" | "pattern" }

/**
 * A resolved day is either one verdict for the whole day (`split: false`),
 * or two verdicts — morning and afternoon — when an explicit half-day
 * availability entry makes the day genuinely different across its halves
 * (`split: true`). Standing patterns and holidays are always whole-day
 * concepts; only an explicit Availability override can split a day.
 */
export type ResolvedDay =
  | ({ split: false } & ResolvedSegment)
  | { split: true; am: ResolvedSegment; pm: ResolvedSegment }

// Availability.status is OUT | WORKING | UNAVAILABLE (see issue #19 r15/r16 —
// the original PTO/SICK/HOLIDAY/COMP/OFF/OFFSITE/OTHER values were collapsed
// down to these three). UNAVAILABLE is its own status, not folded into
// "working" or "off" — it means present but not fully assignable, a real
// distinction the absence board and conflict warnings need to show.
function resolveExplicit(entry: AvailabilityEntry): ResolvedSegment {
  if (entry.status === "OUT") return { status: "off", reason: "availability", source: entry }
  if (entry.status === "UNAVAILABLE") return { status: "unavailable", source: entry }
  return { status: "working", source: "availability" }
}

/** Steps 2–4 of the resolution order: standing pattern, then holiday, then working.
 *  Never sees availability — callers fall back to this only where no explicit
 *  entry applies. */
function resolveFromPattern(
  date: Date,
  workSchedule: ResolveDayWorkSchedule[],
  markers: ResolveDayMarker[]
): ResolvedSegment {
  // Base pattern — CRITICAL: getUTCDay(), never getDay(). A local-time read
  // shifts the weekday by one for anyone west of UTC.
  const weekday = date.getUTCDay()
  const override = workSchedule.find((w) => w.weekday === weekday)
  const workingByPattern = override
    ? override.segment === "FULL_DAY"
    : weekday >= 1 && weekday <= 5

  if (!workingByPattern) {
    return { status: "off", reason: "regular" }
  }

  // Observed holiday, checked only once the standing pattern says working.
  const holiday = findObservedHoliday(toDateString(date), markers)
  if (holiday) {
    return { status: "off", reason: "holiday", markerId: holiday.id, markerLabel: holiday.label }
  }

  return { status: "working", source: "pattern" }
}

/**
 * Resolve whether a person is working on a given date.
 *
 * Resolution order:
 * 1. An explicit availability entry for this date wins outright.
 *    - A FULL_DAY entry resolves the whole day (`split: false`).
 *    - A MORNING and/or AFTERNOON entry resolves that half explicitly; the
 *      other half (if no entry covers it) falls back to steps 2–4 for that
 *      same date. Result is `split: true` whenever any half entry exists,
 *      even if both halves end up at the same verdict — the point is that
 *      an explicit partial override exists, not just what it resolves to.
 * 2. Otherwise, the base pattern: a WorkSchedule override for this weekday,
 *    else the Mon–Fri default. If off → "off (regular)".
 * 3. If the base pattern says working AND an observed HOLIDAY marker covers
 *    the date → "off (holiday)".
 * 4. Otherwise → "working".
 *
 * Holiday is checked *after* the standing pattern so labels come out right:
 * a Tuesday–Saturday person's Monday during a holiday week is "regularly
 * off," never "holiday" — same working/not-working answer either way, but
 * the wrong label is a bug (this is covered explicitly in schedule.test.ts).
 *
 * `date` must be a date-only instant (T00:00:00.000Z).
 */
export function resolveDay(
  date: Date,
  availability: AvailabilityEntry[],
  workSchedule: ResolveDayWorkSchedule[],
  markers: ResolveDayMarker[]
): ResolvedDay {
  const dateStr = toDateString(date)
  const entriesForDate = availability.filter((a) => a.date === dateStr)

  const fullDayEntry = entriesForDate.find((a) => a.segment === "FULL_DAY")
  if (fullDayEntry) {
    return { split: false, ...resolveExplicit(fullDayEntry) }
  }

  const morningEntry = entriesForDate.find((a) => a.segment === "MORNING")
  const afternoonEntry = entriesForDate.find((a) => a.segment === "AFTERNOON")

  if (morningEntry || afternoonEntry) {
    const fallback = () => resolveFromPattern(date, workSchedule, markers)
    return {
      split: true,
      am: morningEntry ? resolveExplicit(morningEntry) : fallback(),
      pm: afternoonEntry ? resolveExplicit(afternoonEntry) : fallback(),
    }
  }

  return { split: false, ...resolveFromPattern(date, workSchedule, markers) }
}

// ─── Write-side helpers (Phase 2) ──────────────────────────────────────────
// Pure functions the availability API routes build on. Kept here, alongside
// resolveDay(), and unit-tested the same way — none of them touch Prisma or
// a transaction directly, so the risky logic (date math, diffing, deletes)
// is verifiable without a DB.

/** Baseline (no explicit availability) working/off verdict for a date,
 *  reduced to the same three-value vocabulary as Availability.status. Used
 *  by expandDateRange() (skipNonWorkingDays) and computeWeekDiff() (deciding
 *  whether a desired day matches "no override needed"). */
function baselineStatus(
  date: Date,
  workSchedule: ResolveDayWorkSchedule[],
  markers: ResolveDayMarker[]
): "OUT" | "WORKING" | "UNAVAILABLE" {
  const segment = resolveFromPattern(date, workSchedule, markers)
  if (segment.status === "off") return "OUT"
  if (segment.status === "unavailable") return "UNAVAILABLE"
  return "WORKING"
}

/** Whether a date is a working day per the standing pattern and holiday
 *  calendar alone — no explicit Availability considered. */
export function isBaseWorkingDay(
  date: Date,
  workSchedule: ResolveDayWorkSchedule[],
  markers: ResolveDayMarker[]
): boolean {
  return baselineStatus(date, workSchedule, markers) === "WORKING"
}

/**
 * Inclusive "YYYY-MM-DD" expansion of a date range, for
 * `POST /api/schedule/availability`'s range support. When
 * `skipNonWorkingDays` is set, dates that are already off per the person's
 * standing pattern or an observed holiday are dropped — so booking two weeks
 * of OUT doesn't create a phantom entry on a standing day off or burn a
 * vacation day on a holiday the person was never going to work anyway.
 */
export function expandDateRange(
  startDate: string,
  endDate: string,
  options: {
    skipNonWorkingDays: boolean
    workSchedule: ResolveDayWorkSchedule[]
    markers: ResolveDayMarker[]
  }
): string[] {
  const dates: string[] = []
  let cursor = new Date(`${startDate}T00:00:00.000Z`)
  const end = new Date(`${endDate}T00:00:00.000Z`)
  while (cursor.getTime() <= end.getTime()) {
    if (!options.skipNonWorkingDays || isBaseWorkingDay(cursor, options.workSchedule, options.markers)) {
      dates.push(toDateString(cursor))
    }
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
  }
  return dates
}

export type WeekDiffDesiredDay =
  // "Revert to baseline" — delete whatever override exists for this date,
  // regardless of shape (FULL_DAY or split AM/PM). Used instead of guessing a
  // FULL_DAY status client-side, which can't correctly express reverting a
  // split day back to its true (possibly OFF) pattern/holiday baseline.
  | { date: string; revert: true }
  | { date: string; segment: string; status: string; note?: string | null }

export interface WeekDiffExistingRow {
  id: string
  date: string
  segment: string
  status: string
  note: string | null
}

export interface WeekDiffResult {
  /** Rows to create or update — write-time collision clearing (a FULL_DAY
   *  write deletes any half rows for that date, and vice versa) still
   *  applies here exactly as it does for the single-day POST route. */
  toUpsert: { date: string; segment: string; status: string; note: string | null }[]
  /** Existing row ids to delete — either reverted to the resolved baseline,
   *  or superseded by a same-date write of the opposite shape (full-day vs
   *  half). */
  toDelete: { id: string }[]
}

/**
 * Diff a desired week (one or two rows per date — a FULL_DAY entry, or one
 * or both of MORNING/AFTERNOON) against the person's current Availability
 * rows for that week and the resolved baseline (standing pattern + holiday
 * calendar, no availability). A desired day that matches what the baseline
 * would already produce needs no row — any existing override for that date
 * is marked for deletion. A desired day that differs is upserted.
 *
 * This is the one-off week editor's core logic (PUT
 * /api/schedule/availability/week) and the riskiest new code in Phase 2 — it
 * deletes rows, so a bug here loses data rather than displaying it wrong.
 * The caller must read `existingRows` inside the same transaction it uses to
 * apply the result, so the diff isn't computed against a stale snapshot.
 */
export function computeWeekDiff(
  desiredDays: WeekDiffDesiredDay[],
  existingRows: WeekDiffExistingRow[],
  workSchedule: ResolveDayWorkSchedule[],
  markers: ResolveDayMarker[]
): WeekDiffResult {
  const toUpsert: WeekDiffResult["toUpsert"] = []
  const toDelete: WeekDiffResult["toDelete"] = []

  const dates = Array.from(new Set(desiredDays.map((d) => d.date)))

  for (const date of dates) {
    const desiredForDate = desiredDays.filter((d) => d.date === date)
    const existingForDate = existingRows.filter((r) => r.date === date)

    // An explicit revert wins outright for this date: drop every existing
    // row (FULL_DAY or split) and write nothing, regardless of any other
    // entries that might also be present for the same date.
    if (desiredForDate.some((d) => "revert" in d)) {
      existingForDate.forEach((r) => toDelete.push({ id: r.id }))
      continue
    }

    const nonRevertDays = desiredForDate as Extract<WeekDiffDesiredDay, { segment: string }>[]
    const baseline = baselineStatus(new Date(`${date}T00:00:00.000Z`), workSchedule, markers)

    // A note of `undefined` means "not specified by this write" (e.g. the
    // week editor doesn't expose note editing) — preserve whatever note the
    // existing row for that same segment already has instead of nulling it
    // out. An explicit `null` still clears it.
    const resolveNote = (desiredNote: string | null | undefined, existing: WeekDiffExistingRow | undefined) =>
      desiredNote !== undefined ? desiredNote : existing?.note ?? null

    // "Matches baseline" (no override needed → delete rather than upsert)
    // has to be judged on the *resolved* note, not just the desired write's
    // own note field — a desired write with no note (e.g. the week editor,
    // which never sends one) must still preserve a note the existing row
    // already carries via resolveNote() below, or that note is silently
    // dropped even though the status alone matches baseline.
    const desiredFullDay = nonRevertDays.length === 1 && nonRevertDays[0].segment === "FULL_DAY"
      ? nonRevertDays[0]
      : undefined

    if (desiredFullDay) {
      const existingSameSeg = existingForDate.find((r) => r.segment === "FULL_DAY")
      const note = resolveNote(desiredFullDay.note, existingSameSeg)
      if (desiredFullDay.status === baseline && !note) {
        existingForDate.forEach((r) => toDelete.push({ id: r.id }))
      } else {
        toUpsert.push({ date, segment: "FULL_DAY", status: desiredFullDay.status, note })
        existingForDate.filter((r) => r.segment !== "FULL_DAY").forEach((r) => toDelete.push({ id: r.id }))
      }
      continue
    }

    // Half-day entries (one or both of MORNING/AFTERNOON in the payload). A
    // half not present in the payload is treated as "revert to baseline" —
    // the week editor always sends the full week it displayed.
    for (const seg of ["MORNING", "AFTERNOON"] as const) {
      const desired = nonRevertDays.find((d) => d.segment === seg)
      const existing = existingForDate.find((r) => r.segment === seg)
      if (desired) {
        const note = resolveNote(desired.note, existing)
        if (desired.status === baseline && !note) {
          if (existing) toDelete.push({ id: existing.id })
        } else {
          toUpsert.push({ date, segment: seg, status: desired.status, note })
        }
      } else if (existing) {
        toDelete.push({ id: existing.id })
      }
    }
    // The date is now split (or reverted); any previous FULL_DAY row for it
    // is superseded either way.
    const existingFullDay = existingForDate.find((r) => r.segment === "FULL_DAY")
    if (existingFullDay) toDelete.push({ id: existingFullDay.id })
  }

  return { toUpsert, toDelete }
}

export interface BlackoutWarning {
  kind: "BLACKOUT"
  label: string
  dates: string[]
}

/**
 * Advisory-only blackout overlap check for a set of written dates. Never
 * blocks the write — returned alongside the created entries so the UI can
 * toast a warning (issue #19 §3: "the write succeeds and returns warnings").
 */
export function detectBlackoutOverlap(
  dates: string[],
  blackoutMarkers: { label: string; startDate: Date; endDate: Date }[]
): BlackoutWarning[] {
  const warnings: BlackoutWarning[] = []
  for (const marker of blackoutMarkers) {
    const start = marker.startDate.getTime()
    const end = marker.endDate.getTime()
    const overlapping = dates.filter((d) => {
      const t = new Date(`${d}T00:00:00.000Z`).getTime()
      return start <= t && t <= end
    })
    if (overlapping.length > 0) {
      warnings.push({ kind: "BLACKOUT", label: marker.label, dates: overlapping })
    }
  }
  return warnings
}

/** The nth (1-based) occurrence of `weekday` (0=Sun..6=Sat) in a UTC month. */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): string {
  const first = new Date(Date.UTC(year, month, 1))
  const offset = (weekday - first.getUTCDay() + 7) % 7
  const day = 1 + offset + (n - 1) * 7
  return toDateString(new Date(Date.UTC(year, month, day)))
}

/** The last occurrence of `weekday` (0=Sun..6=Sat) in a UTC month. */
function lastWeekdayOfMonth(year: number, month: number, weekday: number): string {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const last = new Date(Date.UTC(year, month, lastDay))
  const offset = (last.getUTCDay() - weekday + 7) % 7
  return toDateString(new Date(Date.UTC(year, month, lastDay - offset)))
}

// ─── Marker band layout (Phase 3) ──────────────────────────────────────────

export interface MarkerBandSpan {
  markerId: string
  kind: string
  label: string
  startCol: number // 0-based index into weekDates
  span: number // number of columns, >= 1
}

/**
 * Where a marker's date range lands on a displayed week, in grid-column
 * terms — clamped to the visible week rather than assuming both edges are
 * in frame. A blackout (or holiday) that starts before the week, ends after
 * it, or spans the whole thing must still render as a correct, non-cut-off
 * band (issue #19 §3: "must handle a blackout covering an entire displayed
 * week... not as a span that assumes visible start and end edges").
 *
 * Returns null if the marker doesn't touch this week at all.
 */
export function bandSpan(
  marker: { id: string; kind: string; label: string; startDate: Date; endDate: Date },
  weekDates: string[]
): MarkerBandSpan | null {
  if (weekDates.length === 0) return null
  const start = toDateString(marker.startDate)
  const end = toDateString(marker.endDate)
  if (end < weekDates[0] || start > weekDates[weekDates.length - 1]) return null

  const startCol = Math.max(
    0,
    weekDates.findIndex((d) => d >= start)
  )
  const lastCoveredIdx = weekDates.reduce((acc, d, i) => (d <= end ? i : acc), -1)
  const endCol = lastCoveredIdx === -1 ? weekDates.length - 1 : lastCoveredIdx

  return {
    markerId: marker.id,
    kind: marker.kind,
    label: marker.label,
    startCol,
    span: endCol - startCol + 1,
  }
}

/** All markers that touch this week, laid out as MarkerBandSpans — pass
 *  HOLIDAY/BLACKOUT/NOTE markers covering (or overlapping) the window. */
export function resolveMarkerBands(
  weekDates: string[],
  markers: { id: string; kind: string; label: string; startDate: Date; endDate: Date }[]
): MarkerBandSpan[] {
  return markers
    .map((m) => bandSpan(m, weekDates))
    .filter((s): s is MarkerBandSpan => s !== null)
}

// ─── Shifts (Phase 4) ───────────────────────────────────────────────────────

export interface ShiftDay {
  /** "YYYY-MM-DD" */
  date: string
  holiday: { id: string; label: string } | null
}

/**
 * Shift days in a window = every Saturday, every Sunday, and every date
 * covered by an observed HOLIDAY marker (issue #19 §6) — one row per date
 * even when both conditions apply (a holiday landing on a weekend), with
 * `holiday` set whenever a marker covers it. Shared by the API route so no
 * client reimplements "Saturdays, Sundays, and observed holidays."
 */
export function shiftDaysInWindow(
  startDate: Date,
  endDate: Date,
  holidayMarkers: ResolveDayMarker[]
): ShiftDay[] {
  const days: ShiftDay[] = []
  let cursor = new Date(startDate.getTime())
  while (cursor.getTime() <= endDate.getTime()) {
    const weekday = cursor.getUTCDay()
    const holiday = findObservedHoliday(toDateString(cursor), holidayMarkers)
    if (weekday === 0 || weekday === 6 || holiday) {
      days.push({
        date: toDateString(cursor),
        holiday: holiday ? { id: holiday.id, label: holiday.label } : null,
      })
    }
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
  }
  return days
}

export interface MergedShiftDay extends ShiftDay {
  /** true when this date has no weekend/holiday basis and shows up only
   *  because someone has an explicit ShiftAssignment on it (e.g. a weekday
   *  evening protest) — an extension of §6's "weekends + observed
   *  holidays" rule to arbitrary ad-hoc coverage days. */
  adHoc: boolean
}

/**
 * Merge the calendar-derived shift days (weekends + observed holidays) with
 * any dates that already carry a real ShiftAssignment but aren't derived —
 * an ad-hoc day added directly by an editor. A date stays visible for
 * exactly as long as it has an assignment: once the last assignment on an
 * ad-hoc date is removed, the next call (which reads assignedDates fresh
 * from the DB) simply won't include it anymore — no separate cleanup step.
 */
export function mergeShiftDays(derivedDays: ShiftDay[], assignedDates: string[]): MergedShiftDay[] {
  const derivedDates = new Set(derivedDays.map((d) => d.date))
  const extra = Array.from(new Set(assignedDates)).filter((d) => !derivedDates.has(d))
  const merged: MergedShiftDay[] = [
    ...derivedDays.map((d) => ({ ...d, adHoc: false })),
    ...extra.map((date) => ({ date, holiday: null, adHoc: true })),
  ]
  return merged.sort((a, b) => a.date.localeCompare(b.date))
}

export type ShiftConflict = { kind: "out" } | { kind: "outsidePattern" }

/**
 * The two conflict cases from issue #19 §6 that are worth flagging when
 * assigning a shift — built entirely on resolveDay()'s own output rather
 * than re-deriving anything:
 * - An explicit OUT day → {kind: "out"} (the assignee is booked off).
 * - The standing pattern says this weekday is off (not a holiday) →
 *   {kind: "outsidePattern"}. Naturally suppressed for someone whose
 *   WorkSchedule already includes this weekend day, since resolveDay()
 *   would then resolve the day as pattern-working (or holiday), never
 *   off/regular — no extra check needed here.
 * A holiday is context, not a conflict (that's the point of the shift day),
 * and plain "working"/"unavailable" aren't conflicts either — the third
 * case from §6 (holiday) needs no code, it's just the absence of a warning.
 * For a split day, either half being a conflict makes the whole day one.
 */
export function detectShiftConflict(resolved: ResolvedDay): ShiftConflict | null {
  const segments = resolved.split ? [resolved.am, resolved.pm] : [resolved]
  if (segments.some((s) => s.status === "off" && s.reason === "availability")) return { kind: "out" }
  if (segments.some((s) => s.status === "off" && s.reason === "regular")) return { kind: "outsidePattern" }
  return null
}

export interface ShiftConflictInfo {
  severity: "warning" | "note"
  message: string
}

/** Turns a ShiftConflict into the human sentence shown next to an assignee —
 *  shared by GET /api/schedule/shifts and GET /api/schedule/day so the two
 *  routes that both surface shift conflicts don't drift on the wording. */
export function describeShiftConflict(
  conflict: ShiftConflict | null,
  personName: string,
  weekdayLabel: string
): ShiftConflictInfo | null {
  if (!conflict) return null
  return conflict.kind === "out"
    ? { severity: "warning", message: `${personName} is out that day.` }
    : { severity: "note", message: `${weekdayLabel} is outside ${personName}'s normal schedule.` }
}

/**
 * The standard US federal holiday set for a year — a *starting point* an
 * admin seeds via /admin/calendar and can then edit or delete per-holiday
 * (issue #19 §3). Not an authority: the newsroom's actual observed set is
 * whatever CalendarMarker rows exist after that.
 */
export function standardUsHolidays(year: number): { label: string; date: string }[] {
  return [
    { label: "New Year's Day", date: toDateString(new Date(Date.UTC(year, 0, 1))) },
    { label: "Martin Luther King Jr. Day", date: nthWeekdayOfMonth(year, 0, 1, 3) },
    { label: "Memorial Day", date: lastWeekdayOfMonth(year, 4, 1) },
    { label: "Juneteenth", date: toDateString(new Date(Date.UTC(year, 5, 19))) },
    { label: "Independence Day", date: toDateString(new Date(Date.UTC(year, 6, 4))) },
    { label: "Labor Day", date: nthWeekdayOfMonth(year, 8, 1, 1) },
    { label: "Thanksgiving", date: nthWeekdayOfMonth(year, 10, 4, 4) },
    { label: "Day after Thanksgiving", date: nthWeekdayOfMonth(year, 10, 5, 4) },
    { label: "Christmas", date: toDateString(new Date(Date.UTC(year, 11, 25))) },
  ]
}

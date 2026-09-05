// Staffing schedule resolution logic (Phase 1 of issue #19).
//
// resolveDay() is the single most important function in the staffing
// schedule feature: every view that shows whether someone is working on a
// given day goes through it, so its precedence order and date-arithmetic
// have to be right once, here, rather than reimplemented per-view.

/**
 * Local (non-Prisma) shape for an explicit availability override on one date.
 * The Availability model doesn't exist until Phase 2 — this type lets
 * resolveDay() take its full intended signature now, always passed `[]` in
 * Phase 1. Phase 2 swaps this alias for the real Prisma payload type; the
 * function body and every other call site are unaffected.
 *
 * A date can carry either one FULL_DAY entry or up to two half entries
 * (MORNING + AFTERNOON) — never both a FULL_DAY entry and a half entry for
 * the same date (that invariant is enforced where these rows are written,
 * Phase 2's job, not here).
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

/** Date → "YYYY-MM-DD", reading UTC fields — same idiom as todayString(). */
function toDateStr(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, "0")
  const d = String(date.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

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
  // Inclusive range: lte both ends.
  const time = date.getTime()
  const holiday = markers.find(
    (m) =>
      m.kind === "HOLIDAY" &&
      m.observed &&
      m.startDate.getTime() <= time &&
      time <= m.endDate.getTime()
  )
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
  const dateStr = toDateStr(date)
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

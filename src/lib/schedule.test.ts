import { describe, it, expect } from "vitest"
import { resolveDay, type ResolveDayMarker, type ResolveDayWorkSchedule } from "./schedule"

// All test dates are date-only instants (T00:00:00.000Z), matching how
// CalendarMarker/WorkSchedule dates are actually stored and read.
function dateOnly(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

function holidayMarker(overrides: Partial<ResolveDayMarker> = {}): ResolveDayMarker {
  return {
    id: "marker-1",
    kind: "HOLIDAY",
    label: "Thanksgiving",
    startDate: dateOnly("2026-11-26"),
    endDate: dateOnly("2026-11-26"),
    observed: true,
    ...overrides,
  }
}

describe("resolveDay", () => {
  it("resolves a standard weekday with no overrides as working", () => {
    // 2026-08-31 is a Monday (UTC)
    const result = resolveDay(dateOnly("2026-08-31"), [], [], [])
    expect(result).toEqual({ split: false, status: "working", source: "pattern" })
  })

  it("resolves a standard weekend day with no overrides as off/regular", () => {
    // 2026-09-05 is a Saturday (UTC)
    const result = resolveDay(dateOnly("2026-09-05"), [], [], [])
    expect(result).toEqual({ split: false, status: "off", reason: "regular" })
  })

  it("resolves an OFF-override weekday (e.g. a standing Friday off) as off/regular", () => {
    // 2026-09-04 is a Friday (UTC)
    const workSchedule: ResolveDayWorkSchedule[] = [{ weekday: 5, segment: "OFF" }]
    const result = resolveDay(dateOnly("2026-09-04"), [], workSchedule, [])
    expect(result).toEqual({ split: false, status: "off", reason: "regular" })
  })

  it("resolves a FULL_DAY-override weekend day (e.g. a standing Saturday shift) as working", () => {
    // 2026-09-05 is a Saturday (UTC)
    const workSchedule: ResolveDayWorkSchedule[] = [{ weekday: 6, segment: "FULL_DAY" }]
    const result = resolveDay(dateOnly("2026-09-05"), [], workSchedule, [])
    expect(result).toEqual({ split: false, status: "working", source: "pattern" })
  })

  it("resolves a working day covered by an observed holiday marker as off/holiday", () => {
    // 2026-11-26 is a Thursday (UTC) — a normal working weekday absent a holiday
    const result = resolveDay(dateOnly("2026-11-26"), [], [], [holidayMarker()])
    expect(result).toEqual({
      split: false,
      status: "off",
      reason: "holiday",
      markerId: "marker-1",
      markerLabel: "Thanksgiving",
    })
  })

  it("checks the holiday only after the standing pattern — a standing day off during a holiday week stays 'regular', not 'holiday'", () => {
    // A Tuesday–Saturday person: standing Monday off, working Saturday.
    // 2026-11-23 is the Monday of Thanksgiving week (holiday is Thu 11/26).
    const workSchedule: ResolveDayWorkSchedule[] = [
      { weekday: 1, segment: "OFF" }, // Monday
      { weekday: 6, segment: "FULL_DAY" }, // Saturday
    ]
    const marker = holidayMarker({
      startDate: dateOnly("2026-11-23"),
      endDate: dateOnly("2026-11-29"),
    })
    const result = resolveDay(dateOnly("2026-11-23"), [], workSchedule, [marker])
    expect(result).toEqual({ split: false, status: "off", reason: "regular" })
  })

  it("ignores an unobserved (observed:false) holiday marker — the day still resolves working", () => {
    const marker = holidayMarker({ observed: false })
    const result = resolveDay(dateOnly("2026-11-26"), [], [], [marker])
    expect(result).toEqual({ split: false, status: "working", source: "pattern" })
  })

  it("treats marker date ranges as inclusive on both ends", () => {
    // 2026-11-26/27 (Thu/Fri) inside the range, 2026-11-30 (Mon) just outside it.
    const marker = holidayMarker({
      startDate: dateOnly("2026-11-26"),
      endDate: dateOnly("2026-11-27"),
    })
    expect(resolveDay(dateOnly("2026-11-26"), [], [], [marker])).toMatchObject({ status: "off" })
    expect(resolveDay(dateOnly("2026-11-27"), [], [], [marker])).toMatchObject({ status: "off" })
    expect(resolveDay(dateOnly("2026-11-30"), [], [], [marker])).toMatchObject({ status: "working" })
  })

  it("an explicit FULL_DAY availability entry wins outright over the standing pattern", () => {
    const workSchedule: ResolveDayWorkSchedule[] = [] // normal Mon–Fri working day
    const entry = { date: "2026-08-31", segment: "FULL_DAY", status: "OUT" }
    const result = resolveDay(
      dateOnly("2026-08-31"), // a Monday, normally working
      [entry],
      workSchedule,
      []
    )
    expect(result).toEqual({
      split: false,
      status: "off",
      reason: "availability",
      source: entry,
    })
  })

  it("resolves an UNAVAILABLE availability entry as its own status, not folded into working or off", () => {
    const entry = { date: "2026-08-31", segment: "FULL_DAY", status: "UNAVAILABLE" }
    const result = resolveDay(dateOnly("2026-08-31"), [entry], [], [])
    expect(result).toEqual({ split: false, status: "unavailable", source: entry })
  })

  it("Phase 1 always passes an empty availability array and never affects the result", () => {
    const withEmpty = resolveDay(dateOnly("2026-08-31"), [], [], [])
    const withUnrelated = resolveDay(
      dateOnly("2026-08-31"),
      [{ date: "2099-01-01", segment: "FULL_DAY", status: "OUT" }],
      [],
      []
    )
    expect(withEmpty).toEqual(withUnrelated)
  })

  describe("half-day availability splits the day", () => {
    it("a single MORNING entry splits the day — am from the entry, pm falls back to the pattern", () => {
      const entry = { date: "2026-08-31", segment: "MORNING", status: "OUT" }
      const result = resolveDay(dateOnly("2026-08-31"), [entry], [], []) // a normal working Monday
      expect(result).toEqual({
        split: true,
        am: { status: "off", reason: "availability", source: entry },
        pm: { status: "working", source: "pattern" },
      })
    })

    it("a single AFTERNOON entry splits the day — pm from the entry, am falls back to the pattern", () => {
      const entry = { date: "2026-08-31", segment: "AFTERNOON", status: "OUT" }
      const result = resolveDay(dateOnly("2026-08-31"), [entry], [], [])
      expect(result).toEqual({
        split: true,
        am: { status: "working", source: "pattern" },
        pm: { status: "off", reason: "availability", source: entry },
      })
    })

    it("both MORNING and AFTERNOON entries together resolve each half independently", () => {
      const morning = { date: "2026-08-31", segment: "MORNING", status: "OUT" }
      const afternoon = { date: "2026-08-31", segment: "AFTERNOON", status: "WORKING" }
      const result = resolveDay(dateOnly("2026-08-31"), [morning, afternoon], [], [])
      expect(result).toEqual({
        split: true,
        am: { status: "off", reason: "availability", source: morning },
        pm: { status: "working", source: "availability" },
      })
    })

    it("the fallback half of a split day still checks the holiday calendar", () => {
      // Morning entry only; the working afternoon falls back to pattern+holiday
      // and should resolve to the holiday, not silently to "working".
      const morning = { date: "2026-11-26", segment: "MORNING", status: "OUT" }
      const result = resolveDay(dateOnly("2026-11-26"), [morning], [], [holidayMarker()])
      expect(result).toEqual({
        split: true,
        am: { status: "off", reason: "availability", source: morning },
        pm: { status: "off", reason: "holiday", markerId: "marker-1", markerLabel: "Thanksgiving" },
      })
    })

    it("a FULL_DAY entry takes precedence even if half entries are also present", () => {
      // Shouldn't happen given the write-time invariant (Phase 2's job to
      // enforce), but resolveDay() should still degrade sensibly rather than
      // silently picking one arbitrarily.
      const fullDay = { date: "2026-08-31", segment: "FULL_DAY", status: "OUT" }
      const morning = { date: "2026-08-31", segment: "MORNING", status: "WORKING" }
      const result = resolveDay(dateOnly("2026-08-31"), [fullDay, morning], [], [])
      expect(result).toEqual({ split: false, status: "off", reason: "availability", source: fullDay })
    })
  })

  describe("weekday derivation uses getUTCDay, not local getDay", () => {
    // 2026-08-31T00:00:00.000Z is a Monday in UTC. In a timezone west of UTC
    // (e.g. America/Los_Angeles, UTC-7/-8), naively calling .getDay() on this
    // Date reads local wall-clock time — Aug 30, 23:00 or 22:00 the prior
    // evening — which is a *Sunday*. A standing Sunday-off override should
    // therefore NOT apply to this UTC-Monday date; if resolveDay() ever used
    // getDay() instead of getUTCDay(), this test would start failing for
    // anyone running it in a west-of-UTC TZ.
    it("resolves the UTC weekday regardless of the process TZ", () => {
      const originalTz = process.env.TZ
      process.env.TZ = "America/Los_Angeles"
      try {
        // Standing Sunday off (weekday 0) — must NOT apply to this UTC Monday.
        const sundayOff: ResolveDayWorkSchedule[] = [{ weekday: 0, segment: "OFF" }]
        const result = resolveDay(dateOnly("2026-08-31"), [], sundayOff, [])
        expect(result).toEqual({ split: false, status: "working", source: "pattern" })

        // Conversely, a standing Monday-off override (weekday 1) MUST apply.
        const mondayOff: ResolveDayWorkSchedule[] = [{ weekday: 1, segment: "OFF" }]
        const result2 = resolveDay(dateOnly("2026-08-31"), [], mondayOff, [])
        expect(result2).toEqual({ split: false, status: "off", reason: "regular" })
      } finally {
        process.env.TZ = originalTz
      }
    })
  })
})

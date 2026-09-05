import { describe, it, expect } from "vitest"
import {
  resolveDay,
  shiftDaysInWindow,
  detectShiftConflict,
  describeShiftConflict,
  mergeShiftDays,
  type ResolveDayMarker,
  type ResolveDayWorkSchedule,
} from "./schedule"
import { dateOnly } from "./utils"

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

describe("shiftDaysInWindow", () => {
  it("includes every Saturday and Sunday plus an observed holiday on a weekday, in order", () => {
    // 2026-11-23 (Mon) .. 2026-11-29 (Sun) — Thanksgiving (Thu 11/26) inside.
    const days = shiftDaysInWindow(dateOnly("2026-11-23"), dateOnly("2026-11-29"), [holidayMarker()])
    expect(days.map((d) => d.date)).toEqual(["2026-11-26", "2026-11-28", "2026-11-29"])
    expect(days.find((d) => d.date === "2026-11-26")?.holiday).toEqual({ id: "marker-1", label: "Thanksgiving" })
    expect(days.find((d) => d.date === "2026-11-28")?.holiday).toBeNull()
  })

  it("doesn't duplicate a holiday that falls on a weekend", () => {
    const marker = holidayMarker({ startDate: dateOnly("2026-11-28"), endDate: dateOnly("2026-11-28") })
    const days = shiftDaysInWindow(dateOnly("2026-11-23"), dateOnly("2026-11-29"), [marker])
    expect(days.map((d) => d.date)).toEqual(["2026-11-28", "2026-11-29"])
    expect(days.find((d) => d.date === "2026-11-28")?.holiday).toEqual({ id: "marker-1", label: "Thanksgiving" })
  })

  it("ignores an unobserved holiday marker", () => {
    const marker = holidayMarker({ observed: false })
    const days = shiftDaysInWindow(dateOnly("2026-11-23"), dateOnly("2026-11-29"), [marker])
    expect(days.map((d) => d.date)).toEqual(["2026-11-28", "2026-11-29"])
  })

  it("returns no days for a Mon-Fri-only window with no holiday", () => {
    const days = shiftDaysInWindow(dateOnly("2026-08-31"), dateOnly("2026-09-04"), [])
    expect(days).toEqual([])
  })
})

describe("detectShiftConflict", () => {
  it("flags an explicit OUT day as 'out'", () => {
    const resolved = resolveDay(dateOnly("2026-09-05"), [{ date: "2026-09-05", segment: "FULL_DAY", status: "OUT" }], [], [])
    expect(detectShiftConflict(resolved)).toEqual({ kind: "out" })
  })

  it("flags a plain weekend day (no standing weekend pattern) as 'outsidePattern'", () => {
    // 2026-09-05 is a Saturday with no WorkSchedule override -> off/regular.
    const resolved = resolveDay(dateOnly("2026-09-05"), [], [], [])
    expect(detectShiftConflict(resolved)).toEqual({ kind: "outsidePattern" })
  })

  it("has no conflict for a Tuesday-Saturday person's standing Saturday shift", () => {
    const workSchedule: ResolveDayWorkSchedule[] = [{ weekday: 6, segment: "FULL_DAY" }]
    const resolved = resolveDay(dateOnly("2026-09-05"), [], workSchedule, [])
    expect(detectShiftConflict(resolved)).toBeNull()
  })

  it("has no conflict for a holiday shift day", () => {
    const resolved = resolveDay(dateOnly("2026-11-26"), [], [], [holidayMarker()])
    expect(detectShiftConflict(resolved)).toBeNull()
  })

  it("flags a split day as 'out' when either half is an explicit OUT", () => {
    const resolved = resolveDay(
      dateOnly("2026-09-05"),
      [{ date: "2026-09-05", segment: "MORNING", status: "OUT" }],
      [],
      []
    )
    expect(resolved.split).toBe(true)
    expect(detectShiftConflict(resolved)).toEqual({ kind: "out" })
  })
})

describe("describeShiftConflict", () => {
  it("returns null for no conflict", () => {
    expect(describeShiftConflict(null, "Chen", "Saturday")).toBeNull()
  })

  it("describes an 'out' conflict as a warning naming the person", () => {
    expect(describeShiftConflict({ kind: "out" }, "Chen", "Saturday")).toEqual({
      severity: "warning",
      message: "Chen is out that day.",
    })
  })

  it("describes an 'outsidePattern' conflict as a note naming the weekday and person", () => {
    expect(describeShiftConflict({ kind: "outsidePattern" }, "Chen", "Saturday")).toEqual({
      severity: "note",
      message: "Saturday is outside Chen's normal schedule.",
    })
  })
})

describe("mergeShiftDays", () => {
  it("marks derived days as not ad-hoc", () => {
    const derived = shiftDaysInWindow(dateOnly("2026-09-05"), dateOnly("2026-09-05"), [])
    const merged = mergeShiftDays(derived, [])
    expect(merged).toEqual([{ date: "2026-09-05", holiday: null, adHoc: false }])
  })

  it("adds an assigned weekday date as ad-hoc, sorted alongside derived days", () => {
    // 2026-09-05 (Sat) is derived; 2026-09-02 (Wed) is only assigned.
    const derived = shiftDaysInWindow(dateOnly("2026-09-01"), dateOnly("2026-09-06"), [])
    const merged = mergeShiftDays(derived, ["2026-09-02"])
    expect(merged.map((d) => d.date)).toEqual(["2026-09-02", "2026-09-05", "2026-09-06"])
    expect(merged.find((d) => d.date === "2026-09-02")).toEqual({ date: "2026-09-02", holiday: null, adHoc: true })
  })

  it("doesn't duplicate a date that's both derived and assigned", () => {
    const derived = shiftDaysInWindow(dateOnly("2026-09-05"), dateOnly("2026-09-05"), [])
    const merged = mergeShiftDays(derived, ["2026-09-05", "2026-09-05"])
    expect(merged).toEqual([{ date: "2026-09-05", holiday: null, adHoc: false }])
  })

  it("returns nothing for an empty window with no assignments", () => {
    expect(mergeShiftDays([], [])).toEqual([])
  })
})

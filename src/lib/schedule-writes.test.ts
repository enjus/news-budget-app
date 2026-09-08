import { describe, it, expect } from "vitest"
import {
  expandDateRange,
  computeWeekDiff,
  detectBlackoutOverlap,
  isBaseWorkingDay,
  standardUsHolidays,
  bandSpan,
  resolveMarkerBands,
  type WeekDiffDesiredDay,
  type WeekDiffExistingRow,
} from "./schedule"
import { dateOnly } from "./utils"
import type { ResolveDayMarker, ResolveDayWorkSchedule } from "./schedule"

describe("isBaseWorkingDay", () => {
  it("is true for a normal weekday and false for a normal weekend day", () => {
    expect(isBaseWorkingDay(dateOnly("2026-08-31"), [], [])).toBe(true) // Monday
    expect(isBaseWorkingDay(dateOnly("2026-09-05"), [], [])).toBe(false) // Saturday
  })

  it("respects a standing OFF override and an observed holiday", () => {
    const workSchedule: ResolveDayWorkSchedule[] = [{ weekday: 5, segment: "OFF" }] // Friday off
    expect(isBaseWorkingDay(dateOnly("2026-09-04"), workSchedule, [])).toBe(false)

    const holiday: ResolveDayMarker = {
      id: "h1",
      kind: "HOLIDAY",
      label: "Thanksgiving",
      startDate: dateOnly("2026-11-26"),
      endDate: dateOnly("2026-11-26"),
      observed: true,
    }
    expect(isBaseWorkingDay(dateOnly("2026-11-26"), [], [holiday])).toBe(false)
  })
})

describe("expandDateRange", () => {
  it("expands an inclusive range into YYYY-MM-DD strings", () => {
    expect(expandDateRange("2026-09-01", "2026-09-03", { skipNonWorkingDays: false, workSchedule: [], markers: [] })).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
    ])
  })

  it("a single-day range returns exactly one date", () => {
    expect(expandDateRange("2026-09-01", "2026-09-01", { skipNonWorkingDays: false, workSchedule: [], markers: [] })).toEqual([
      "2026-09-01",
    ])
  })

  it("skipNonWorkingDays drops weekends and observed holidays, keeping them when off", () => {
    const holiday: ResolveDayMarker = {
      id: "h1",
      kind: "HOLIDAY",
      label: "Thanksgiving",
      startDate: dateOnly("2026-11-26"),
      endDate: dateOnly("2026-11-26"),
      observed: true,
    }
    // Mon 11/23 .. Sun 11/29 — includes the weekend and Thanksgiving Thursday.
    const withSkip = expandDateRange("2026-11-23", "2026-11-29", {
      skipNonWorkingDays: true,
      workSchedule: [],
      markers: [holiday],
    })
    expect(withSkip).toEqual(["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-27"])

    const withoutSkip = expandDateRange("2026-11-23", "2026-11-29", {
      skipNonWorkingDays: false,
      workSchedule: [],
      markers: [holiday],
    })
    expect(withoutSkip).toHaveLength(7)
  })

  it("skipNonWorkingDays keeps a standing Saturday shift and drops a standing Monday off", () => {
    const workSchedule: ResolveDayWorkSchedule[] = [
      { weekday: 1, segment: "OFF" }, // Monday
      { weekday: 6, segment: "FULL_DAY" }, // Saturday
    ]
    const dates = expandDateRange("2026-09-05", "2026-09-06", {
      // Sat 9/5, Sun 9/6
      skipNonWorkingDays: true,
      workSchedule,
      markers: [],
    })
    expect(dates).toEqual(["2026-09-05"])
  })
})

describe("computeWeekDiff", () => {
  const noPattern: ResolveDayWorkSchedule[] = []
  const noMarkers: ResolveDayMarker[] = []

  it("a full-day override matching the baseline reverts (deletes) an existing row", () => {
    const desired: WeekDiffDesiredDay[] = [{ date: "2026-08-31", segment: "FULL_DAY", status: "WORKING" }] // matches Monday's normal pattern
    const existing: WeekDiffExistingRow[] = [{ id: "row-1", date: "2026-08-31", segment: "FULL_DAY", status: "OUT", note: null }]
    const result = computeWeekDiff(desired, existing, noPattern, noMarkers)
    expect(result.toUpsert).toEqual([])
    expect(result.toDelete).toEqual([{ id: "row-1" }])
  })

  it("a full-day override differing from the baseline is upserted, and note prevents a false match", () => {
    const desired: WeekDiffDesiredDay[] = [{ date: "2026-08-31", segment: "FULL_DAY", status: "WORKING", note: "swap" }]
    const result = computeWeekDiff(desired, [], noPattern, noMarkers)
    expect(result.toUpsert).toEqual([{ date: "2026-08-31", segment: "FULL_DAY", status: "WORKING", note: "swap" }])
    expect(result.toDelete).toEqual([])
  })

  it("matching the baseline with no existing row is a no-op", () => {
    const desired: WeekDiffDesiredDay[] = [{ date: "2026-08-31", segment: "FULL_DAY", status: "WORKING" }]
    const result = computeWeekDiff(desired, [], noPattern, noMarkers)
    expect(result.toUpsert).toEqual([])
    expect(result.toDelete).toEqual([])
  })

  it("switching a date from FULL_DAY to a half-day override deletes the old FULL_DAY row", () => {
    const desired: WeekDiffDesiredDay[] = [{ date: "2026-08-31", segment: "MORNING", status: "OUT" }]
    const existing: WeekDiffExistingRow[] = [{ id: "row-1", date: "2026-08-31", segment: "FULL_DAY", status: "WORKING", note: null }]
    const result = computeWeekDiff(desired, existing, noPattern, noMarkers)
    expect(result.toUpsert).toEqual([{ date: "2026-08-31", segment: "MORNING", status: "OUT", note: null }])
    expect(result.toDelete).toEqual([{ id: "row-1" }])
  })

  it("a half not present in the payload reverts (deletes) an existing half row", () => {
    const desired: WeekDiffDesiredDay[] = [{ date: "2026-08-31", segment: "MORNING", status: "OUT" }]
    const existing: WeekDiffExistingRow[] = [
      { id: "row-am", date: "2026-08-31", segment: "MORNING", status: "OUT", note: null },
      { id: "row-pm", date: "2026-08-31", segment: "AFTERNOON", status: "UNAVAILABLE", note: null },
    ]
    const result = computeWeekDiff(desired, existing, noPattern, noMarkers)
    // AM matches the existing row exactly, so it's re-upserted (idempotent) rather than deleted...
    expect(result.toUpsert).toEqual([{ date: "2026-08-31", segment: "MORNING", status: "OUT", note: null }])
    // ...and PM, no longer in the payload, is dropped.
    expect(result.toDelete).toEqual([{ id: "row-pm" }])
  })

  it("preserves an existing row's note when the desired day omits note entirely", () => {
    const desired: WeekDiffDesiredDay[] = [{ date: "2026-08-31", segment: "FULL_DAY", status: "OUT" }] // no `note` key at all
    const existing: WeekDiffExistingRow[] = [
      { id: "row-1", date: "2026-08-31", segment: "FULL_DAY", status: "WORKING", note: "swapped with Rivera" },
    ]
    const result = computeWeekDiff(desired, existing, noPattern, noMarkers)
    expect(result.toUpsert).toEqual([{ date: "2026-08-31", segment: "FULL_DAY", status: "OUT", note: "swapped with Rivera" }])
  })

  it("a full-day override matching the baseline status still preserves an existing note (upserts, doesn't delete)", () => {
    // Status alone matches Monday's normal WORKING pattern, but the stored
    // row carries a note the desired write doesn't mention — deleting it
    // outright (the old behavior) would silently drop that note.
    const desired: WeekDiffDesiredDay[] = [{ date: "2026-08-31", segment: "FULL_DAY", status: "WORKING" }]
    const existing: WeekDiffExistingRow[] = [
      { id: "row-1", date: "2026-08-31", segment: "FULL_DAY", status: "WORKING", note: "working from the courthouse" },
    ]
    const result = computeWeekDiff(desired, existing, noPattern, noMarkers)
    expect(result.toUpsert).toEqual([{ date: "2026-08-31", segment: "FULL_DAY", status: "WORKING", note: "working from the courthouse" }])
    expect(result.toDelete).toEqual([])
  })

  it("still clears the note when the desired day explicitly sends note: null", () => {
    const desired: WeekDiffDesiredDay[] = [{ date: "2026-08-31", segment: "FULL_DAY", status: "OUT", note: null }]
    const existing: WeekDiffExistingRow[] = [
      { id: "row-1", date: "2026-08-31", segment: "FULL_DAY", status: "WORKING", note: "old note" },
    ]
    const result = computeWeekDiff(desired, existing, noPattern, noMarkers)
    expect(result.toUpsert).toEqual([{ date: "2026-08-31", segment: "FULL_DAY", status: "OUT", note: null }])
  })

  it("a revert entry deletes every existing row for that date regardless of shape", () => {
    const desired: WeekDiffDesiredDay[] = [{ date: "2026-08-31", revert: true }]
    const existing: WeekDiffExistingRow[] = [
      { id: "row-am", date: "2026-08-31", segment: "MORNING", status: "OUT", note: null },
      { id: "row-pm", date: "2026-08-31", segment: "AFTERNOON", status: "UNAVAILABLE", note: "training" },
    ]
    const result = computeWeekDiff(desired, existing, noPattern, noMarkers)
    expect(result.toUpsert).toEqual([])
    expect(result.toDelete).toEqual(expect.arrayContaining([{ id: "row-am" }, { id: "row-pm" }]))
  })

  it("a revert entry with no existing rows is a no-op", () => {
    const desired: WeekDiffDesiredDay[] = [{ date: "2026-08-31", revert: true }]
    const result = computeWeekDiff(desired, [], noPattern, noMarkers)
    expect(result.toUpsert).toEqual([])
    expect(result.toDelete).toEqual([])
  })
})

describe("detectBlackoutOverlap", () => {
  const blackout = { label: "Holiday season — no PTO", startDate: dateOnly("2026-12-15"), endDate: dateOnly("2026-12-31") }

  it("flags dates fully inside the blackout", () => {
    const warnings = detectBlackoutOverlap(["2026-12-20", "2026-12-25"], [blackout])
    expect(warnings).toEqual([{ kind: "BLACKOUT", label: blackout.label, dates: ["2026-12-20", "2026-12-25"] }])
  })

  it("flags only the overlapping subset when a range straddles the edge", () => {
    const warnings = detectBlackoutOverlap(["2026-12-14", "2026-12-15", "2026-12-31", "2027-01-01"], [blackout])
    expect(warnings).toEqual([{ kind: "BLACKOUT", label: blackout.label, dates: ["2026-12-15", "2026-12-31"] }])
  })

  it("returns no warning when nothing overlaps", () => {
    expect(detectBlackoutOverlap(["2026-01-01"], [blackout])).toEqual([])
  })
})

describe("standardUsHolidays", () => {
  it("computes the known 2026 dates for nth-weekday and fixed holidays", () => {
    const holidays = standardUsHolidays(2026)
    const byLabel = Object.fromEntries(holidays.map((h) => [h.label, h.date]))
    expect(byLabel["New Year's Day"]).toBe("2026-01-01")
    expect(byLabel["Martin Luther King Jr. Day"]).toBe("2026-01-19")
    expect(byLabel["Labor Day"]).toBe("2026-09-07")
    expect(byLabel["Thanksgiving"]).toBe("2026-11-26")
    expect(byLabel["Day after Thanksgiving"]).toBe("2026-11-27")
    expect(byLabel["Christmas"]).toBe("2026-12-25")
  })

  it("returns 9 holidays with unique dates", () => {
    const holidays = standardUsHolidays(2026)
    expect(holidays).toHaveLength(9)
    expect(new Set(holidays.map((h) => h.date)).size).toBe(9)
  })
})

describe("bandSpan / resolveMarkerBands", () => {
  // Mon 2026-08-31 .. Sun 2026-09-06
  const weekDates = [
    "2026-08-31",
    "2026-09-01",
    "2026-09-02",
    "2026-09-03",
    "2026-09-04",
    "2026-09-05",
    "2026-09-06",
  ]

  function marker(overrides: { startDate: string; endDate: string; id?: string; kind?: string; label?: string }) {
    return {
      id: overrides.id ?? "m1",
      kind: overrides.kind ?? "BLACKOUT",
      label: overrides.label ?? "Holiday season — no PTO",
      startDate: dateOnly(overrides.startDate),
      endDate: dateOnly(overrides.endDate),
    }
  }

  it("spans the full displayed week when the marker brackets it entirely", () => {
    const m = marker({ startDate: "2026-08-01", endDate: "2026-09-30" })
    expect(bandSpan(m, weekDates)).toEqual({ markerId: "m1", kind: "BLACKOUT", label: m.label, startCol: 0, span: 7 })
  })

  it("clamps the start when the marker begins before the visible week", () => {
    const m = marker({ startDate: "2026-08-01", endDate: "2026-09-02" })
    expect(bandSpan(m, weekDates)).toEqual({ markerId: "m1", kind: "BLACKOUT", label: m.label, startCol: 0, span: 3 })
  })

  it("clamps the end when the marker continues past the visible week", () => {
    const m = marker({ startDate: "2026-09-04", endDate: "2026-12-31" })
    expect(bandSpan(m, weekDates)).toEqual({ markerId: "m1", kind: "BLACKOUT", label: m.label, startCol: 4, span: 3 })
  })

  it("handles an ordinary two-day holiday entirely inside the week", () => {
    const m = marker({ id: "h1", kind: "HOLIDAY", label: "Thanksgiving", startDate: "2026-09-03", endDate: "2026-09-04" })
    expect(bandSpan(m, weekDates)).toEqual({ markerId: "h1", kind: "HOLIDAY", label: "Thanksgiving", startCol: 3, span: 2 })
  })

  it("returns null for a marker that doesn't touch the week at all", () => {
    expect(bandSpan(marker({ startDate: "2026-07-01", endDate: "2026-07-05" }), weekDates)).toBeNull()
    expect(bandSpan(marker({ startDate: "2026-10-01", endDate: "2026-10-05" }), weekDates)).toBeNull()
  })

  it("resolveMarkerBands filters out non-overlapping markers and keeps overlapping ones", () => {
    const inWeek = marker({ id: "in", startDate: "2026-09-01", endDate: "2026-09-02" })
    const outOfWeek = marker({ id: "out", startDate: "2026-01-01", endDate: "2026-01-05" })
    const bands = resolveMarkerBands(weekDates, [inWeek, outOfWeek])
    expect(bands).toHaveLength(1)
    expect(bands[0].markerId).toBe("in")
  })
})

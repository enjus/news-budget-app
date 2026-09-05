import { describe, it, expect } from "vitest"
import { groupPeople, isObservedHoliday } from "./groupPeople"
import type { DaySchedulePerson } from "@/lib/hooks/useDaySchedule"

function person(id: string, resolved: DaySchedulePerson["resolved"]): DaySchedulePerson {
  return { id, name: id, teamIds: [], resolved, note: null }
}

describe("groupPeople", () => {
  it("buckets a normal day's verdicts and drops anyone working normally", () => {
    const people = [
      person("out", { split: false, status: "off", reason: "availability", source: { date: "2026-09-05", segment: "FULL_DAY", status: "OUT" } }),
      person("half", { split: true, am: { status: "working", source: "pattern" }, pm: { status: "off", reason: "availability", source: { date: "2026-09-05", segment: "AFTERNOON", status: "OUT" } } }),
      person("unavail", { split: false, status: "unavailable", source: { date: "2026-09-05", segment: "FULL_DAY", status: "UNAVAILABLE" } }),
      person("off-regular", { split: false, status: "off", reason: "regular" }),
      person("working", { split: false, status: "working", source: "pattern" }),
    ]

    const grouped = groupPeople(people, false)
    expect(grouped.out.map((p) => p.id)).toEqual(["out"])
    expect(grouped.halfDay.map((p) => p.id)).toEqual(["half"])
    expect(grouped.unavailable.map((p) => p.id)).toEqual(["unavail"])
    expect(grouped.regularlyOff.map((p) => p.id)).toEqual(["off-regular"])
    expect(grouped.workingOnHoliday).toEqual([])
    // "working" (normal pattern) never appears anywhere
    const allListed = [...grouped.out, ...grouped.halfDay, ...grouped.unavailable, ...grouped.regularlyOff]
    expect(allListed.some((p) => p.id === "working")).toBe(false)
  })

  it("on a holiday, only lists explicit WORKING/UNAVAILABLE overrides — never off/regular or off/holiday", () => {
    const people = [
      person("shift-worker", { split: false, status: "working", source: "availability" }),
      person("off-site", { split: false, status: "unavailable", source: { date: "2026-11-26", segment: "FULL_DAY", status: "UNAVAILABLE" } }),
      person("normal-holiday-off", { split: false, status: "off", reason: "holiday", markerId: "h1", markerLabel: "Thanksgiving" }),
      person("standing-day-off", { split: false, status: "off", reason: "regular" }),
    ]

    const grouped = groupPeople(people, true)
    expect(grouped.workingOnHoliday.map((p) => p.id).sort()).toEqual(["off-site", "shift-worker"])
    expect(grouped.out).toEqual([])
    expect(grouped.regularlyOff).toEqual([])
  })
})

describe("isObservedHoliday", () => {
  it("matches a date inside an observed holiday marker's inclusive range", () => {
    const markers = [{ kind: "HOLIDAY", observed: true, startDate: "2026-11-26T00:00:00.000Z", endDate: "2026-11-26T00:00:00.000Z", label: "Thanksgiving" }]
    expect(isObservedHoliday("2026-11-26", markers)).toEqual({ label: "Thanksgiving" })
    expect(isObservedHoliday("2026-11-25", markers)).toBeNull()
  })

  it("ignores an unobserved holiday marker", () => {
    const markers = [{ kind: "HOLIDAY", observed: false, startDate: "2026-12-24T00:00:00.000Z", endDate: "2026-12-24T00:00:00.000Z", label: "Christmas Eve" }]
    expect(isObservedHoliday("2026-12-24", markers)).toBeNull()
  })

  it("ignores non-HOLIDAY markers", () => {
    const markers = [{ kind: "BLACKOUT", observed: true, startDate: "2026-12-01T00:00:00.000Z", endDate: "2026-12-31T00:00:00.000Z", label: "Blackout" }]
    expect(isObservedHoliday("2026-12-15", markers)).toBeNull()
  })
})

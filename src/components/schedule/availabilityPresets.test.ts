import { describe, it, expect } from "vitest"
import { summarizeClear } from "./availabilityPresets"
import type { MyScheduleDay } from "@/lib/hooks/useMySchedule"

const base = (date: string): MyScheduleDay => ({ date, note: null, split: false, status: "working", source: "pattern" })
const out = (date: string): MyScheduleDay => ({
  date,
  note: null,
  split: false,
  status: "off",
  reason: "availability",
  source: { date, segment: "FULL_DAY", status: "OUT" },
})
const shift = (date: string): MyScheduleDay => ({
  date,
  note: null,
  split: false,
  status: "working",
  source: "shift",
  shiftRoles: ["EDITOR"],
  baseline: { status: "off", reason: "regular" },
})

describe("summarizeClear", () => {
  it("lists override dates and shift dates across a fully loaded range", () => {
    const days = {
      "2027-01-08": out("2027-01-08"),
      "2027-01-09": shift("2027-01-09"),
      "2027-01-10": base("2027-01-10"),
      "2027-01-11": out("2027-01-11"),
    }
    expect(summarizeClear("2027-01-08", "2027-01-11", days)).toEqual({
      overrideDates: ["2027-01-08", "2027-01-11"],
      shiftDates: ["2027-01-09"],
      complete: true,
    })
  })

  it("counts an OUT that beat a shift as both an override and a shift date", () => {
    const day: MyScheduleDay = { ...out("2027-01-09"), shiftRoles: ["EDITOR"] }
    expect(summarizeClear("2027-01-09", "2027-01-09", { "2027-01-09": day })).toEqual({
      overrideDates: ["2027-01-09"],
      shiftDates: ["2027-01-09"],
      complete: true,
    })
  })

  it("counts a split day as an override", () => {
    const split: MyScheduleDay = {
      date: "2027-01-12",
      note: null,
      split: true,
      am: { status: "working", source: "pattern" },
      pm: { status: "off", reason: "availability", source: { date: "2027-01-12", segment: "AFTERNOON", status: "OUT" } },
    }
    expect(summarizeClear("2027-01-12", "2027-01-12", { "2027-01-12": split }).overrideDates).toEqual(["2027-01-12"])
  })

  it("reports incomplete when the range runs past the loaded days", () => {
    const summary = summarizeClear("2027-01-30", "2027-02-02", { "2027-01-30": out("2027-01-30"), "2027-01-31": base("2027-01-31") })
    expect(summary).toEqual({ overrideDates: ["2027-01-30"], shiftDates: [], complete: false })
  })

  it("skips untracked days and treats a reversed range as incomplete", () => {
    const untracked = { date: "2026-12-31", untracked: true } as MyScheduleDay
    expect(summarizeClear("2026-12-31", "2026-12-31", { "2026-12-31": untracked })).toEqual({
      overrideDates: [],
      shiftDates: [],
      complete: true,
    })
    expect(summarizeClear("2027-01-02", "2027-01-01", {}).complete).toBe(false)
  })
})

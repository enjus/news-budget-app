// The 6 presets from issue #19 §4 — the picker never makes anyone reason
// about segments, it just maps a plain-English choice to the row(s) that
// get written. Shared between the day-level PresetPicker and the one-off
// WeekEditor so the two surfaces can't drift apart.

import type { MyScheduleDay } from "@/lib/hooks/useMySchedule"
import type { ResolvedSegment } from "@/lib/schedule"

export type PresetId = "OUT" | "WORKING" | "UNAVAILABLE" | "HALF_AM" | "HALF_PM" | "CUSTOM"

export const AVAILABILITY_PRESETS: { id: PresetId; label: string }[] = [
  { id: "OUT", label: "Out" },
  { id: "WORKING", label: "Working (on a normal day off or holiday)" },
  { id: "UNAVAILABLE", label: "Working, unavailable (off site, training, court, etc.)" },
  { id: "HALF_AM", label: "Half day — here in the morning" },
  { id: "HALF_PM", label: "Half day — here in the afternoon" },
  { id: "CUSTOM", label: "Custom (set morning/afternoon independently)" },
]

export interface PresetRow {
  segment: "FULL_DAY" | "MORNING" | "AFTERNOON"
  status: "OUT" | "WORKING" | "UNAVAILABLE"
}

export function presetRows(id: PresetId, custom?: { am: PresetRow["status"]; pm: PresetRow["status"] }): PresetRow[] {
  switch (id) {
    case "OUT":
      return [{ segment: "FULL_DAY", status: "OUT" }]
    case "WORKING":
      return [{ segment: "FULL_DAY", status: "WORKING" }]
    case "UNAVAILABLE":
      return [{ segment: "FULL_DAY", status: "UNAVAILABLE" }]
    case "HALF_AM":
      // Here in the morning — the afternoon is the exception, so that's the
      // row written; the morning falls back through the pattern normally.
      return [{ segment: "AFTERNOON", status: "OUT" }]
    case "HALF_PM":
      return [{ segment: "MORNING", status: "OUT" }]
    case "CUSTOM":
      return [
        { segment: "MORNING", status: custom?.am ?? "WORKING" },
        { segment: "AFTERNOON", status: custom?.pm ?? "WORKING" },
      ]
  }
}

/** A ResolvedSegment's verdict, reduced to the Availability.status vocabulary
 *  (OUT | WORKING | UNAVAILABLE) — for pre-filling a picker's per-half
 *  Select from what a day already resolves to. */
export function segmentToStatus(segment: ResolvedSegment): PresetRow["status"] {
  if (segment.status === "off") return "OUT"
  if (segment.status === "unavailable") return "UNAVAILABLE"
  return "WORKING"
}

/** Best-effort mapping from a resolved day back to the preset that produced
 *  it — "BASELINE" (no override) unless an explicit availability entry is
 *  behind the result. A genuinely split day (differing AM/PM) that doesn't
 *  match HALF_AM/HALF_PM's "one side falls back to baseline" shape defaults
 *  to CUSTOM so both halves stay independently editable rather than
 *  collapsing to a single preset. Shared by WeekEditor and PresetPicker so
 *  reopening either for an existing entry shows what's actually there. */
export function presetForResolvedDay(day: MyScheduleDay | undefined): PresetId | "BASELINE" {
  if (!day) return "BASELINE"
  if (day.split) return "CUSTOM"
  if (day.status === "off" && day.reason === "availability") return "OUT"
  if (day.status === "working" && day.source === "availability") return "WORKING"
  if (day.status === "unavailable") return "UNAVAILABLE"
  return "BASELINE"
}

export interface ClearSummary {
  /** Dates in range with an explicit entry Clear would delete. */
  overrideDates: string[]
  /** Dates in range with a shift — Clear leaves these alone. */
  shiftDates: string[]
  /** Whether every date in range was in `knownDays`. When false, the counts
   *  cover only the loaded part (the picker's date inputs can be widened
   *  past what the view fetched), so the UI shouldn't state a number. */
  complete: boolean
}

/** What "Clear" would do over [start, end], from the days a view already
 *  has loaded. Any explicit entry resolves with source "availability"
 *  (whole day or either half), which presetForResolvedDay() reports as a
 *  non-BASELINE preset; untracked (pre-cutover) days are skipped. */
export function summarizeClear(
  start: string,
  end: string,
  knownDays: Record<string, MyScheduleDay | undefined>
): ClearSummary {
  const summary: ClearSummary = { overrideDates: [], shiftDates: [], complete: true }
  if (!start || !end || end < start) return { ...summary, complete: false }
  let cursor = new Date(`${start}T00:00:00.000Z`)
  const last = new Date(`${end}T00:00:00.000Z`)
  while (cursor.getTime() <= last.getTime()) {
    const date = cursor.toISOString().slice(0, 10)
    const day = knownDays[date]
    if (!day) summary.complete = false
    else if (!day.untracked) {
      if (presetForResolvedDay(day) !== "BASELINE") summary.overrideDates.push(date)
      if (day.shiftRoles && day.shiftRoles.length > 0) summary.shiftDates.push(date)
    }
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
  }
  return summary
}

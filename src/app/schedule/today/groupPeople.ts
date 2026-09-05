// Pure grouping of already-resolved day verdicts for the absence board
// (issue #19 §5) — no re-derivation of resolveDay()'s precedence rules, just
// bucketing what the API already resolved. Colocated with its test per the
// same "pure function, unit-tested" precedent as computeWeekDiff() etc. in
// src/lib/schedule.ts.

import type { DaySchedulePerson } from "@/lib/hooks/useDaySchedule"
import type { ResolvedSegment } from "@/lib/schedule"

export interface GroupedDay {
  out: DaySchedulePerson[]
  halfDay: DaySchedulePerson[]
  unavailable: DaySchedulePerson[]
  regularlyOff: DaySchedulePerson[]
  /** Only populated when `isHoliday` — who's working despite the holiday. */
  workingOnHoliday: DaySchedulePerson[]
}

/** Whether an observed HOLIDAY marker covers `date` — flips the board from
 *  "who's out" to "who's working" (issue #19 §5). */
export function isObservedHoliday(date: string, markers: { kind: string; observed: boolean; startDate: string | Date; endDate: string | Date }[]): { label: string } | null {
  const holiday = markers.find((m) => {
    if (m.kind !== "HOLIDAY" || !m.observed) return false
    const start = typeof m.startDate === "string" ? m.startDate.slice(0, 10) : m.startDate.toISOString().slice(0, 10)
    const end = typeof m.endDate === "string" ? m.endDate.slice(0, 10) : m.endDate.toISOString().slice(0, 10)
    return start <= date && date <= end
  }) as { label: string } | undefined
  return holiday ? { label: holiday.label } : null
}

export function groupPeople(people: DaySchedulePerson[], isHoliday: boolean): GroupedDay {
  const grouped: GroupedDay = { out: [], halfDay: [], unavailable: [], regularlyOff: [], workingOnHoliday: [] }

  for (const person of people) {
    const { resolved } = person

    if (isHoliday) {
      // "Working" on a holiday only happens via an explicit override (the
      // standing pattern always loses to an observed holiday per
      // resolveDay()'s precedence order) — that includes a constrained
      // UNAVAILABLE override, since presence (even off-site) is still the
      // exceptional thing the holiday view is surfacing. Check both halves
      // of a split day — someone with only a morning WORKING override (PM
      // falling back to the holiday) is still scheduled and must not be
      // dropped just because the day as a whole is split.
      const isPresentSegment = (segment: ResolvedSegment) =>
        (segment.status === "working" && segment.source === "availability") || segment.status === "unavailable"
      const isPresent = resolved.split
        ? isPresentSegment(resolved.am) || isPresentSegment(resolved.pm)
        : isPresentSegment(resolved)
      if (isPresent) grouped.workingOnHoliday.push(person)
      continue
    }

    if (resolved.split) {
      grouped.halfDay.push(person)
    } else if (resolved.status === "off" && resolved.reason === "availability") {
      grouped.out.push(person)
    } else if (resolved.status === "unavailable") {
      grouped.unavailable.push(person)
    } else if (resolved.status === "off" && resolved.reason === "regular") {
      grouped.regularlyOff.push(person)
    }
    // resolved.status === "working" via the standing pattern (working
    // normally) is deliberately not bucketed — never listed on the board.
  }

  return grouped
}

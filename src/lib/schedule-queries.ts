// Shared batched loader for /api/schedule/day, /api/schedule/week, and
// /api/schedule/export — all three need the same shape (roster + the whole
// roster's Availability/WorkSchedule rows for a window + markers covering
// it) grouped by personId before calling resolveDay() in memory. Extracted
// after code review flagged the fetch-and-group logic as copy-pasted
// near-verbatim across the three routes, which had already drifted (day
// fetched all marker kinds, week/export filtered) — one place to fix a
// query or grouping bug instead of three.

import { prisma } from "@/lib/prisma"
import { ROSTER_WHERE } from "@/lib/utils"

export interface RosterMember {
  id: string
  name: string
  teamIds: string[]
  /** Role per team membership (EDITOR|MEMBER) — a person can be an editor on
   *  one team and a plain member on another, so this is keyed by team, not
   *  global. Added for /schedule/teams' "editors at the top" ordering. */
  teamRoles: { teamId: string; role: string }[]
}

export type AvailabilityRow = {
  personId: string
  date: Date
  segment: string
  status: string
  note: string | null
}

export type WorkScheduleRow = { personId: string; weekday: number; segment: string }

export type MarkerRow = {
  id: string
  kind: string
  label: string
  startDate: Date
  endDate: Date
  observed: boolean
  note: string | null
}

export interface ScheduleWindowData {
  roster: RosterMember[]
  teams: { id: string; name: string }[]
  availabilityByPerson: Map<string, AvailabilityRow[]>
  workScheduleByPerson: Map<string, WorkScheduleRow[]>
  markers: MarkerRow[]
}

function groupByPerson<T extends { personId: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const row of rows) {
    const list = map.get(row.personId) ?? []
    list.push(row)
    map.set(row.personId, list)
  }
  return map
}

/**
 * Roster (isStaff && isActive) + their Availability rows in [startDate,
 * endDate] + the whole WorkSchedule table + CalendarMarkers overlapping the
 * window, in 4 queries regardless of roster size or window length — never
 * one round trip per person. `markerKinds` narrows the marker query (omit
 * for all kinds, matching /api/schedule/day's original "return everything
 * for the band" behavior).
 */
export async function loadScheduleWindow(
  startDate: Date,
  endDate: Date,
  markerKinds?: string[]
): Promise<ScheduleWindowData> {
  const [roster, availabilityRows, workSchedule, markers] = await Promise.all([
    prisma.person.findMany({
      where: ROSTER_WHERE,
      select: {
        id: true,
        name: true,
        teamMemberships: { select: { role: true, team: { select: { id: true, name: true } } } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.availability.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      select: { personId: true, date: true, segment: true, status: true, note: true },
    }),
    prisma.workSchedule.findMany({
      select: { personId: true, weekday: true, segment: true },
    }),
    prisma.calendarMarker.findMany({
      where: {
        ...(markerKinds ? { kind: { in: markerKinds } } : {}),
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      select: { id: true, kind: true, label: true, startDate: true, endDate: true, observed: true, note: true },
    }),
  ])

  const teams = new Map<string, { id: string; name: string }>()
  const rosterOut: RosterMember[] = roster.map((person) => {
    for (const tm of person.teamMemberships) teams.set(tm.team.id, tm.team)
    return {
      id: person.id,
      name: person.name,
      teamIds: person.teamMemberships.map((tm) => tm.team.id),
      teamRoles: person.teamMemberships.map((tm) => ({ teamId: tm.team.id, role: tm.role })),
    }
  })

  return {
    roster: rosterOut,
    // Alphabetical, not insertion order — insertion order was just an
    // accident of which team the name-sorted roster's first member happens
    // to belong to, and reshuffled whenever the roster changed.
    teams: Array.from(teams.values()).sort((a, b) => a.name.localeCompare(b.name)),
    availabilityByPerson: groupByPerson(availabilityRows),
    workScheduleByPerson: groupByPerson(workSchedule),
    markers,
  }
}

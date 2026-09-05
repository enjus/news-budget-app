import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dateOnly, ROSTER_WHERE } from "@/lib/utils";
import { resolveDay, type AvailabilityEntry } from "@/lib/schedule";

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Resolved status for the whole roster on one date, plus markers covering it
// (issue #19 §8). Batched into 4 queries total regardless of roster size —
// one roster query, one availability query, one work-schedule query, one
// marker query — never N per-person round trips (the fix the Phase 2
// progress note calls for /api/schedule/week; /day follows the same shape).
// Read-open, matching every other schedule GET (no session/role check).
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");

    if (!date || !DATE_RE.test(date)) {
      return NextResponse.json({ error: "date (YYYY-MM-DD) is required" }, { status: 400 });
    }

    const dateObj = dateOnly(date);

    const [roster, availabilityRows, workSchedule, markers] = await Promise.all([
      prisma.person.findMany({
        where: ROSTER_WHERE,
        select: {
          id: true,
          name: true,
          teamMemberships: { select: { team: { select: { id: true, name: true } } } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.availability.findMany({
        where: { date: dateObj },
        select: { personId: true, segment: true, status: true, note: true },
      }),
      prisma.workSchedule.findMany({
        select: { personId: true, weekday: true, segment: true },
      }),
      prisma.calendarMarker.findMany({
        where: { startDate: { lte: dateObj }, endDate: { gte: dateObj } },
        select: { id: true, kind: true, label: true, startDate: true, endDate: true, observed: true, note: true },
      }),
    ]);

    const availabilityByPerson = new Map<string, typeof availabilityRows>();
    for (const row of availabilityRows) {
      const list = availabilityByPerson.get(row.personId) ?? [];
      list.push(row);
      availabilityByPerson.set(row.personId, list);
    }
    const workScheduleByPerson = new Map<string, typeof workSchedule>();
    for (const row of workSchedule) {
      const list = workScheduleByPerson.get(row.personId) ?? [];
      list.push(row);
      workScheduleByPerson.set(row.personId, list);
    }
    const holidayMarkers = markers.filter((m) => m.kind === "HOLIDAY");

    const people = roster.map((person) => {
      const rows = availabilityByPerson.get(person.id) ?? [];
      const entries: AvailabilityEntry[] = rows.map((r) => ({ date, segment: r.segment, status: r.status }));
      const resolved = resolveDay(dateObj, entries, workScheduleByPerson.get(person.id) ?? [], holidayMarkers);

      const fullDayRow = rows.find((r) => r.segment === "FULL_DAY");
      const amRow = rows.find((r) => r.segment === "MORNING");
      const pmRow = rows.find((r) => r.segment === "AFTERNOON");

      return {
        id: person.id,
        name: person.name,
        teamIds: person.teamMemberships.map((tm) => tm.team.id),
        resolved,
        note: resolved.split ? null : fullDayRow?.note ?? null,
        amNote: resolved.split ? amRow?.note ?? null : undefined,
        pmNote: resolved.split ? pmRow?.note ?? null : undefined,
      };
    });

    const teams = new Map<string, { id: string; name: string }>();
    for (const person of roster) {
      for (const tm of person.teamMemberships) {
        teams.set(tm.team.id, tm.team);
      }
    }

    return NextResponse.json({ date, people, teams: Array.from(teams.values()), markers });
  } catch (error) {
    console.error("GET /api/schedule/day error:", error);
    return NextResponse.json({ error: "Failed to fetch day schedule" }, { status: 500 });
  }
}

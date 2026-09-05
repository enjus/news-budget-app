import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dateOnly, toDateString, ROSTER_WHERE } from "@/lib/utils";
import { resolveDay, detectBlackoutOverlap, type AvailabilityEntry } from "@/lib/schedule";

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Roster-wide resolved status for a Monday-Sunday week, plus markers
// covering it (issue #19 §8 — the team grid's data source). This is the
// batched query the Phase 2 progress note flagged as still needed: one
// roster query, one availability query, one work-schedule query, one marker
// query for the whole roster/window — never one call per person. Read-open,
// matching every other schedule GET.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start");

    if (!start || !DATE_RE.test(start)) {
      return NextResponse.json({ error: "start (YYYY-MM-DD) is required" }, { status: 400 });
    }

    const startDate = dateOnly(start);
    if (startDate.getUTCDay() !== 1) {
      return NextResponse.json({ error: "start must be a Monday" }, { status: 400 });
    }

    const weekDates = Array.from({ length: 7 }, (_, i) =>
      toDateString(new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000))
    );
    const endDate = dateOnly(weekDates[6]);

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
        where: { date: { gte: startDate, lte: endDate } },
        select: { personId: true, date: true, segment: true, status: true, note: true },
      }),
      prisma.workSchedule.findMany({
        select: { personId: true, weekday: true, segment: true },
      }),
      prisma.calendarMarker.findMany({
        where: {
          kind: { in: ["HOLIDAY", "BLACKOUT", "NOTE"] },
          startDate: { lte: endDate },
          endDate: { gte: startDate },
        },
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
    const blackoutMarkers = markers.filter((m) => m.kind === "BLACKOUT");

    const people = roster.map((person) => {
      const rows = availabilityByPerson.get(person.id) ?? [];
      const entries: AvailabilityEntry[] = rows.map((r) => ({
        date: toDateString(r.date),
        segment: r.segment,
        status: r.status,
      }));
      const personWorkSchedule = workScheduleByPerson.get(person.id) ?? [];

      const days = weekDates.map((date) => {
        const resolved = resolveDay(dateOnly(date), entries, personWorkSchedule, holidayMarkers);
        const inBlackout = detectBlackoutOverlap([date], blackoutMarkers).length > 0;
        const rowsForDate = rows.filter((r) => toDateString(r.date) === date);
        const note = resolved.split
          ? null
          : rowsForDate.find((r) => r.segment === "FULL_DAY")?.note ?? null;
        return { date, ...resolved, note, inBlackout };
      });

      return {
        id: person.id,
        name: person.name,
        teamIds: person.teamMemberships.map((tm) => tm.team.id),
        days,
      };
    });

    const teams = new Map<string, { id: string; name: string }>();
    for (const person of roster) {
      for (const tm of person.teamMemberships) {
        teams.set(tm.team.id, tm.team);
      }
    }

    return NextResponse.json({
      start: weekDates[0],
      end: weekDates[6],
      teams: Array.from(teams.values()),
      people,
      markers,
    });
  } catch (error) {
    console.error("GET /api/schedule/week error:", error);
    return NextResponse.json({ error: "Failed to fetch week schedule" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dateOnly, weekdayName } from "@/lib/utils";
import { resolveDay, resolveNotes, detectShiftConflict, describeShiftConflict, type AvailabilityEntry } from "@/lib/schedule";
import { loadScheduleWindow } from "@/lib/schedule-queries";

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Resolved status for the whole roster on one date, plus markers covering it
// (issue #19 §8). Batched via loadScheduleWindow() — 4 queries total
// regardless of roster size, never N per-person round trips. Read-open,
// matching every other schedule GET (no session/role check).
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");

    if (!date || !DATE_RE.test(date)) {
      return NextResponse.json({ error: "date (YYYY-MM-DD) is required" }, { status: 400 });
    }

    const dateObj = dateOnly(date);
    // Independent of each other — loadScheduleWindow() only needs the date
    // range, shiftAssignment only needs dateObj — so they run concurrently
    // rather than paying both round trips in series.
    const [{ roster, teams, availabilityByPerson, workScheduleByPerson, markers }, shiftAssignments] =
      await Promise.all([
        loadScheduleWindow(dateObj, dateObj),
        prisma.shiftAssignment.findMany({
          where: { date: dateObj },
          include: { person: { select: { id: true, name: true } } },
        }),
      ]);
    const holidayMarkers = markers.filter((m) => m.kind === "HOLIDAY");

    const people = roster.map((person) => {
      const rows = availabilityByPerson.get(person.id) ?? [];
      const entries: AvailabilityEntry[] = rows.map((r) => ({ date, segment: r.segment, status: r.status }));
      const resolved = resolveDay(dateObj, entries, workScheduleByPerson.get(person.id) ?? [], holidayMarkers);

      return {
        id: person.id,
        name: person.name,
        teamIds: person.teamIds,
        resolved,
        ...resolveNotes(resolved, rows),
      };
    });

    // Any shift assigned on this date, filled roles only (issue #19 §5
    // extension — an unfilled slot is a /schedule/shifts concern, not
    // something the absence board needs to surface).
    const weekdayLabel = weekdayName(date);
    const shifts = shiftAssignments.map((a) => {
      const rows = availabilityByPerson.get(a.personId) ?? [];
      const entries: AvailabilityEntry[] = rows.map((r) => ({ date, segment: r.segment, status: r.status }));
      const resolved = resolveDay(dateObj, entries, workScheduleByPerson.get(a.personId) ?? [], holidayMarkers);
      return {
        id: a.id,
        shiftRole: a.shiftRole,
        personId: a.personId,
        name: a.person.name,
        note: a.note,
        conflict: describeShiftConflict(detectShiftConflict(resolved), a.person.name, weekdayLabel),
      };
    });

    return NextResponse.json({ date, people, teams, markers, shifts });
  } catch (error) {
    console.error("GET /api/schedule/day error:", error);
    return NextResponse.json({ error: "Failed to fetch day schedule" }, { status: 500 });
  }
}

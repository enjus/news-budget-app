import { NextRequest, NextResponse } from "next/server";
import { addDays, dateOnly, toDateString } from "@/lib/utils";
import { resolveDay, resolveNotes, detectBlackoutOverlap, expandDateRange, type AvailabilityEntry } from "@/lib/schedule";
import { loadScheduleWindow } from "@/lib/schedule-queries";

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_WINDOW_DAYS = 42;

// Roster-wide resolved status for a Monday-Sunday week, plus markers
// covering it (issue #19 §8 — the team grid's data source). Batched via
// loadScheduleWindow() — 4 queries total for the whole roster/window, never
// one call per person. Read-open, matching every other schedule GET.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start");

    if (!start || !DATE_RE.test(start)) {
      return NextResponse.json({ error: "start (YYYY-MM-DD) is required" }, { status: 400 });
    }

    const endParam = searchParams.get("end");
    if (endParam !== null && !DATE_RE.test(endParam)) {
      return NextResponse.json({ error: "end must be YYYY-MM-DD" }, { status: 400 });
    }

    const startDate = dateOnly(start);
    // Without `end` this is the original fixed Monday-Sunday week; with it,
    // the window is caller-defined so the Monday rule doesn't apply.
    if (endParam === null && startDate.getUTCDay() !== 1) {
      return NextResponse.json({ error: "start must be a Monday" }, { status: 400 });
    }

    const windowEnd = endParam ?? addDays(start, 6);
    const spanDays = (dateOnly(windowEnd).getTime() - startDate.getTime()) / DAY_MS + 1;
    // Written as a positive range check so NaN (a well-formed but impossible
    // date like 2026-13-45) fails it too, instead of slipping past `< 1 || > max`.
    if (!(spanDays >= 1 && spanDays <= MAX_WINDOW_DAYS)) {
      return NextResponse.json({ error: `end must be within ${MAX_WINDOW_DAYS} days of start` }, { status: 400 });
    }

    // A plain day walk, delegated to the same tested date-range walker the
    // availability write path uses rather than a third hand-rolled ms-based
    // loop (unconditional here — skipNonWorkingDays only matters for a
    // write, so workSchedule/markers are unused for this call).
    const weekDates = expandDateRange(start, windowEnd, { skipNonWorkingDays: false, workSchedule: [], markers: [] });
    const endDate = dateOnly(weekDates[weekDates.length - 1]);

    const { roster, teams, availabilityByPerson, workScheduleByPerson, markers } = await loadScheduleWindow(
      startDate,
      endDate,
      ["HOLIDAY", "BLACKOUT", "NOTE"]
    );
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
        return { date, ...resolved, ...resolveNotes(resolved, rowsForDate), inBlackout };
      });

      return {
        id: person.id,
        name: person.name,
        teamIds: person.teamIds,
        teamRoles: person.teamRoles,
        days,
      };
    });

    return NextResponse.json({
      start: weekDates[0],
      end: weekDates[weekDates.length - 1],
      teams,
      people,
      markers,
    });
  } catch (error) {
    console.error("GET /api/schedule/week error:", error);
    return NextResponse.json({ error: "Failed to fetch week schedule" }, { status: 500 });
  }
}

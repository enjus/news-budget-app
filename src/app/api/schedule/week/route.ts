import { NextRequest, NextResponse } from "next/server";
import { dateOnly, toDateString } from "@/lib/utils";
import { resolveDay, detectBlackoutOverlap, type AvailabilityEntry } from "@/lib/schedule";
import { loadScheduleWindow } from "@/lib/schedule-queries";

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

    const startDate = dateOnly(start);
    if (startDate.getUTCDay() !== 1) {
      return NextResponse.json({ error: "start must be a Monday" }, { status: 400 });
    }

    const weekDates = Array.from({ length: 7 }, (_, i) =>
      toDateString(new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000))
    );
    const endDate = dateOnly(weekDates[6]);

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
        const note = resolved.split
          ? null
          : rowsForDate.find((r) => r.segment === "FULL_DAY")?.note ?? null;
        return { date, ...resolved, note, inBlackout };
      });

      return {
        id: person.id,
        name: person.name,
        teamIds: person.teamIds,
        days,
      };
    });

    return NextResponse.json({
      start: weekDates[0],
      end: weekDates[6],
      teams,
      people,
      markers,
    });
  } catch (error) {
    console.error("GET /api/schedule/week error:", error);
    return NextResponse.json({ error: "Failed to fetch week schedule" }, { status: 500 });
  }
}

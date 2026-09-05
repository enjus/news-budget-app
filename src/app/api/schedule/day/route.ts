import { NextRequest, NextResponse } from "next/server";
import { dateOnly } from "@/lib/utils";
import { resolveDay, type AvailabilityEntry } from "@/lib/schedule";
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
    const { roster, teams, availabilityByPerson, workScheduleByPerson, markers } = await loadScheduleWindow(
      dateObj,
      dateObj
    );
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
        teamIds: person.teamIds,
        resolved,
        note: resolved.split ? null : fullDayRow?.note ?? null,
        amNote: resolved.split ? amRow?.note ?? null : undefined,
        pmNote: resolved.split ? pmRow?.note ?? null : undefined,
      };
    });

    return NextResponse.json({ date, people, teams, markers });
  } catch (error) {
    console.error("GET /api/schedule/day error:", error);
    return NextResponse.json({ error: "Failed to fetch day schedule" }, { status: 500 });
  }
}

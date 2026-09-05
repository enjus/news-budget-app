import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dateOnly, toDateString, ROSTER_WHERE } from "@/lib/utils";
import { resolveDay, detectBlackoutOverlap, type AvailabilityEntry, type ResolvedDay, type ResolvedSegment } from "@/lib/schedule";

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;

function csvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCsvRow(fields: string[]): string {
  return fields.map(csvField).join(",");
}

// A fuller-fidelity label than the UI chip's (which leaves plain "working
// normally" blank as a visual convention) — a CSV export is the record, so
// every row states its status explicitly.
function segmentLabel(segment: ResolvedSegment): string {
  if (segment.status === "off" && segment.reason === "regular") return "Regularly off";
  if (segment.status === "off" && segment.reason === "holiday") return `Holiday: ${segment.markerLabel}`;
  if (segment.status === "off" && segment.reason === "availability") return "Out";
  if (segment.status === "unavailable") return "Unavailable";
  if (segment.status === "working" && segment.source === "availability") return "Working (override)";
  return "Working";
}

function statusLabel(resolved: ResolvedDay): string {
  if (!resolved.split) return segmentLabel(resolved);
  return `Split (AM: ${segmentLabel(resolved.am)}, PM: ${segmentLabel(resolved.pm)})`;
}

// CSV export of the full roster's resolved schedule over a range (issue #19
// §10 — "people trust a system they can get their data out of"). One row
// per roster person × date in range, the complete record rather than just
// exceptions — an editor exporting a season wants every day accounted for,
// not only the ones with an override. Read-open, matching every other
// schedule GET; batched the same way as /api/schedule/week.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    if (!start || !end || !DATE_RE.test(start) || !DATE_RE.test(end) || end < start) {
      return NextResponse.json({ error: "start and end (YYYY-MM-DD, end >= start) are required" }, { status: 400 });
    }

    const startDate = dateOnly(start);
    const endDate = dateOnly(end);
    const dayCount = Math.round((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    if (dayCount > MAX_RANGE_DAYS) {
      return NextResponse.json({ error: `Range too large — max ${MAX_RANGE_DAYS} days` }, { status: 400 });
    }

    const dates = Array.from({ length: dayCount }, (_, i) =>
      toDateString(new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000))
    );

    const [roster, availabilityRows, workSchedule, markers] = await Promise.all([
      prisma.person.findMany({
        where: ROSTER_WHERE,
        select: {
          id: true,
          name: true,
          teamMemberships: { select: { team: { select: { name: true } } } },
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
        where: { kind: { in: ["HOLIDAY", "BLACKOUT"] }, startDate: { lte: endDate }, endDate: { gte: startDate } },
        select: { id: true, kind: true, label: true, startDate: true, endDate: true, observed: true },
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

    const rows: string[] = [toCsvRow(["Person", "Teams", "Date", "Status", "Note", "In blackout"])];

    for (const person of roster) {
      const teamNames = person.teamMemberships.map((tm) => tm.team.name).join("; ");
      const rawRows = availabilityByPerson.get(person.id) ?? [];
      const entries: AvailabilityEntry[] = rawRows.map((r) => ({
        date: toDateString(r.date),
        segment: r.segment,
        status: r.status,
      }));
      const personWorkSchedule = workScheduleByPerson.get(person.id) ?? [];

      for (const date of dates) {
        const resolved = resolveDay(dateOnly(date), entries, personWorkSchedule, holidayMarkers);
        const inBlackout = detectBlackoutOverlap([date], blackoutMarkers).length > 0;
        const rowsForDate = rawRows.filter((r) => toDateString(r.date) === date);
        const note = resolved.split ? "" : rowsForDate.find((r) => r.segment === "FULL_DAY")?.note ?? "";

        rows.push(
          toCsvRow([person.name, teamNames, date, statusLabel(resolved), note, inBlackout ? "Y" : "N"])
        );
      }
    }

    return new Response(rows.join("\n") + "\n", {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="schedule-${start}-to-${end}.csv"`,
      },
    });
  } catch (error) {
    console.error("GET /api/schedule/export error:", error);
    return NextResponse.json({ error: "Failed to export schedule" }, { status: 500 });
  }
}

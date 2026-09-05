import { NextRequest, NextResponse } from "next/server";
import { dateOnly, toDateString } from "@/lib/utils";
import { resolveDay, detectBlackoutOverlap, type AvailabilityEntry, type ResolvedDay, type ResolvedSegment } from "@/lib/schedule";
import { loadScheduleWindow, type AvailabilityRow } from "@/lib/schedule-queries";

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;

function csvField(value: string): string {
  // \r alone (no \n) is still a row-boundary character for plenty of CSV
  // consumers (old Mac line endings, paste artifacts) — quote on any of
  // \r, \n, or a comma/quote, not just \n.
  if (/[",\r\n]/.test(value)) {
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

// A split (half-day) date can carry a note on either half — surface both
// rather than blanking the column, since this export is meant to be the
// complete record (a half-day PTO note like "doctor appt AM" is exactly the
// kind of detail someone exports the CSV to keep).
function noteFor(resolved: ResolvedDay, rowsForDate: AvailabilityRow[]): string {
  if (!resolved.split) {
    return rowsForDate.find((r) => r.segment === "FULL_DAY")?.note ?? "";
  }
  const amNote = rowsForDate.find((r) => r.segment === "MORNING")?.note;
  const pmNote = rowsForDate.find((r) => r.segment === "AFTERNOON")?.note;
  return [amNote && `AM: ${amNote}`, pmNote && `PM: ${pmNote}`].filter(Boolean).join(" / ");
}

// CSV export of the full roster's resolved schedule over a range (issue #19
// §10 — "people trust a system they can get their data out of"). One row
// per roster person × date in range, the complete record rather than just
// exceptions — an editor exporting a season wants every day accounted for,
// not only the ones with an override. Read-open, matching every other
// schedule GET; batched via the same loadScheduleWindow() as /api/schedule/week.
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

    const { roster, teams, availabilityByPerson, workScheduleByPerson, markers } = await loadScheduleWindow(
      startDate,
      endDate,
      ["HOLIDAY", "BLACKOUT"]
    );
    const teamNameById = new Map(teams.map((t) => [t.id, t.name]));
    const holidayMarkers = markers.filter((m) => m.kind === "HOLIDAY");
    const blackoutMarkers = markers.filter((m) => m.kind === "BLACKOUT");

    const rows: string[] = [toCsvRow(["Person", "Teams", "Date", "Status", "Note", "In blackout"])];

    for (const person of roster) {
      const teamNames = person.teamIds.map((id) => teamNameById.get(id) ?? id).join("; ");
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

        rows.push(
          toCsvRow([
            person.name,
            teamNames,
            date,
            statusLabel(resolved),
            noteFor(resolved, rowsForDate),
            inBlackout ? "Y" : "N",
          ])
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

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dateOnly, toDateString } from "@/lib/utils";
import { resolveDay, type AvailabilityEntry } from "@/lib/schedule";

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> };

const MAX_RANGE_DAYS = 366;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// One person's resolved days over a window — server-side resolveDay(), so no
// client reimplements the precedence rules. Read-open, matching the
// work-schedule GET's precedent.
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
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

    const person = await prisma.person.findUnique({ where: { id }, select: { id: true } });
    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    const [availabilityRows, workSchedule, markers] = await Promise.all([
      prisma.availability.findMany({
        where: { personId: id, date: { gte: startDate, lte: endDate } },
        select: { date: true, segment: true, status: true, note: true },
      }),
      prisma.workSchedule.findMany({
        where: { personId: id },
        select: { weekday: true, segment: true },
      }),
      prisma.calendarMarker.findMany({
        where: { kind: "HOLIDAY", observed: true, startDate: { lte: endDate }, endDate: { gte: startDate } },
        select: { id: true, kind: true, label: true, startDate: true, endDate: true, observed: true },
      }),
    ]);

    const availability: AvailabilityEntry[] = availabilityRows.map((row) => ({
      date: toDateString(row.date),
      segment: row.segment,
      status: row.status,
    }));

    // Notes aren't part of AvailabilityEntry (resolveDay() only needs
    // date/segment/status), so they're looked up separately here and
    // attached alongside the resolved verdict — otherwise a day's note is
    // silently unreachable from this response, which is what made the
    // "Update availability" picker on /schedule/me appear to forget a note
    // on reopen (it does save; this endpoint just never returned it back).
    const days = [];
    let cursor = new Date(startDate);
    while (cursor.getTime() <= endDate.getTime()) {
      const dateStr = toDateString(cursor);
      const resolved = resolveDay(cursor, availability, workSchedule, markers);
      const rowsForDate = availabilityRows.filter((r) => toDateString(r.date) === dateStr);
      const note = resolved.split ? null : rowsForDate.find((r) => r.segment === "FULL_DAY")?.note ?? null;
      const amNote = resolved.split ? rowsForDate.find((r) => r.segment === "MORNING")?.note ?? null : undefined;
      const pmNote = resolved.split ? rowsForDate.find((r) => r.segment === "AFTERNOON")?.note ?? null : undefined;
      days.push({ date: dateStr, ...resolved, note, amNote, pmNote });
      cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    }

    return NextResponse.json({ days, markers });
  } catch (error) {
    console.error("GET /api/people/[id]/availability error:", error);
    return NextResponse.json({ error: "Failed to fetch availability" }, { status: 500 });
  }
}

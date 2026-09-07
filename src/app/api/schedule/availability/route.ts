import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAvailabilitySchema } from "@/lib/validations";
import { canEditSchedule, dateOnly } from "@/lib/utils";
import { expandDateRange, detectBlackoutOverlap } from "@/lib/schedule";
import { checkWriteLimit, requireJSON, prismaErrorCode } from "@/lib/api-helpers";

export const dynamic = 'force-dynamic'

const MAX_RANGE_DAYS = 180;

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !canEditSchedule(session.user.appRole)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const limited = checkWriteLimit(session.user.id);
    if (limited) return limited;

    const jsonError = requireJSON(request);
    if (jsonError) return jsonError;

    const body = await request.json();
    const result = createAvailabilitySchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", fieldErrors: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { personId, startDate, endDate, rows, note, skipNonWorkingDays } = result.data;

    const startBound = dateOnly(startDate);
    const endBound = dateOnly(endDate);
    const dayCount = Math.round((endBound.getTime() - startBound.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    if (dayCount > MAX_RANGE_DAYS) {
      return NextResponse.json({ error: `Range too large — max ${MAX_RANGE_DAYS} days` }, { status: 400 });
    }

    const person = await prisma.person.findUnique({ where: { id: personId }, select: { id: true } });
    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    const [workSchedule, markers] = await Promise.all([
      prisma.workSchedule.findMany({
        where: { personId },
        select: { weekday: true, segment: true },
      }),
      prisma.calendarMarker.findMany({
        where: {
          kind: { in: ["HOLIDAY", "BLACKOUT"] },
          startDate: { lte: endBound },
          endDate: { gte: startBound },
        },
        select: { id: true, kind: true, label: true, startDate: true, endDate: true, observed: true },
      }),
    ]);

    const dates = expandDateRange(startDate, endDate, {
      skipNonWorkingDays,
      workSchedule,
      markers: markers.filter((m) => m.kind === "HOLIDAY"),
    });

    if (dates.length === 0) {
      return NextResponse.json({ entries: [], warnings: [] });
    }

    // Clear every segment NOT in this write — including the opposite half of
    // a half-day preset — so a stale row from a previous, different-shaped
    // write (e.g. a CUSTOM MORNING+AFTERNOON pair, or the FULL_DAY row) can
    // never survive alongside what's being written now.
    const writtenSegments = new Set(rows.map((r) => r.segment));
    const clearSegments = (["FULL_DAY", "MORNING", "AFTERNOON"] as const).filter((s) => !writtenSegments.has(s));
    const dateObjs = dates.map((d) => dateOnly(d));

    const entries = await prisma.$transaction(async (tx) => {
      await tx.availability.deleteMany({
        where: {
          personId,
          date: { in: dateObjs },
          segment: { in: [...clearSegments, ...writtenSegments] },
        },
      });

      // Delete-then-create rather than per-date upsert: a batched write
      // instead of up to MAX_RANGE_DAYS * rows.length sequential round-trips.
      await tx.availability.createMany({
        data: dates.flatMap((date) =>
          rows.map((row) => ({
            personId,
            date: dateOnly(date),
            segment: row.segment,
            status: row.status,
            note: note ?? null,
            createdByUserId: session.user.id,
            updatedByUserId: session.user.id,
          }))
        ),
      });

      return tx.availability.findMany({
        where: { personId, date: { in: dateObjs }, segment: { in: Array.from(writtenSegments) } },
      });
    });

    const blackoutMarkers = markers.filter((m) => m.kind === "BLACKOUT");
    const warnings = detectBlackoutOverlap(dates, blackoutMarkers);

    return NextResponse.json({ entries, warnings }, { status: 201 });
  } catch (error: unknown) {
    if (prismaErrorCode(error) === "P2025") {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }
    console.error("POST /api/schedule/availability error:", error);
    return NextResponse.json({ error: "Failed to write availability" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { putWeekAvailabilitySchema } from "@/lib/validations";
import { canEditSchedule, dateOnly, toDateString } from "@/lib/utils";
import { computeWeekDiff, resolveDay, type AvailabilityEntry } from "@/lib/schedule";
import { checkWriteLimit, requireJSON, prismaErrorCode } from "@/lib/api-helpers";

export const dynamic = 'force-dynamic'

// The one-off week editor: diffs a desired week against the person's current
// Availability rows and the resolved baseline, writing/deleting only what
// differs — all inside one transaction, reading current state fresh within
// it so a concurrent write elsewhere isn't silently reverted. This is the
// riskiest new route in Phase 2 (it deletes rows), see computeWeekDiff()'s
// doc comment in src/lib/schedule.ts.
export async function PUT(request: NextRequest) {
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
    const result = putWeekAvailabilitySchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", fieldErrors: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { personId, days } = result.data;
    if (days.length === 0) {
      return NextResponse.json({ error: "days must not be empty" }, { status: 400 });
    }

    const dates = Array.from(new Set(days.map((d) => d.date))).sort();
    const rangeStart = dateOnly(dates[0]);
    const rangeEnd = dateOnly(dates[dates.length - 1]);

    const person = await prisma.person.findUnique({ where: { id: personId }, select: { id: true } });
    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    const finalDays = await prisma.$transaction(async (tx) => {
      const [existingRows, workSchedule, markers] = await Promise.all([
        tx.availability.findMany({
          where: { personId, date: { gte: rangeStart, lte: rangeEnd } },
          select: { id: true, date: true, segment: true, status: true, note: true },
        }),
        tx.workSchedule.findMany({ where: { personId }, select: { weekday: true, segment: true } }),
        tx.calendarMarker.findMany({
          where: { kind: "HOLIDAY", observed: true, startDate: { lte: rangeEnd }, endDate: { gte: rangeStart } },
          select: { id: true, kind: true, label: true, startDate: true, endDate: true, observed: true },
        }),
      ]);

      const existingByKey = existingRows.map((r) => ({
        id: r.id,
        date: toDateString(r.date),
        segment: r.segment,
        status: r.status,
        note: r.note,
      }));

      const diff = computeWeekDiff(days, existingByKey, workSchedule, markers);

      if (diff.toDelete.length > 0) {
        await tx.availability.deleteMany({ where: { id: { in: diff.toDelete.map((d) => d.id) } } });
      }
      for (const row of diff.toUpsert) {
        await tx.availability.upsert({
          where: { personId_date_segment: { personId, date: dateOnly(row.date), segment: row.segment } },
          create: {
            personId,
            date: dateOnly(row.date),
            segment: row.segment,
            status: row.status,
            note: row.note,
            createdByUserId: session.user.id,
            updatedByUserId: session.user.id,
          },
          update: { status: row.status, note: row.note, updatedByUserId: session.user.id },
        });
      }

      const finalRows = await tx.availability.findMany({
        where: { personId, date: { gte: rangeStart, lte: rangeEnd } },
        select: { date: true, segment: true, status: true },
      });
      const availability: AvailabilityEntry[] = finalRows.map((r) => ({
        date: toDateString(r.date),
        segment: r.segment,
        status: r.status,
      }));

      return dates.map((date) => ({ date, ...resolveDay(dateOnly(date), availability, workSchedule, markers) }));
    });

    return NextResponse.json({ days: finalDays });
  } catch (error: unknown) {
    if (prismaErrorCode(error) === "P2025") {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }
    console.error("PUT /api/schedule/availability/week error:", error);
    return NextResponse.json({ error: "Failed to save week" }, { status: 500 });
  }
}

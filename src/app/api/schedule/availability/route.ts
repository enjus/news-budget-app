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

    const { personId, startDate, endDate, segment, status, note, skipNonWorkingDays } = result.data;

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

    const clearSegments = segment === "FULL_DAY" ? ["MORNING", "AFTERNOON"] : ["FULL_DAY"];

    const entries = await prisma.$transaction(async (tx) => {
      await tx.availability.deleteMany({
        where: { personId, date: { in: dates.map((d) => dateOnly(d)) }, segment: { in: clearSegments } },
      });

      const written = [];
      for (const date of dates) {
        const row = await tx.availability.upsert({
          where: { personId_date_segment: { personId, date: dateOnly(date), segment } },
          create: {
            personId,
            date: dateOnly(date),
            segment,
            status,
            note: note ?? null,
            createdByUserId: session.user.id,
            updatedByUserId: session.user.id,
          },
          update: {
            status,
            note: note ?? null,
            updatedByUserId: session.user.id,
          },
        });
        written.push(row);
      }
      return written;
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

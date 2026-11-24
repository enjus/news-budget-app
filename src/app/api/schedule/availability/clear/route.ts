import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { clearAvailabilitySchema } from "@/lib/validations";
import { canEditSchedule, dateOnly, toDateString } from "@/lib/utils";
import { checkWriteLimit, requireJSON } from "@/lib/api-helpers";

export const dynamic = 'force-dynamic'

const MAX_RANGE_DAYS = 180;

// POST: "Clear" in the availability picker. Deletes every explicit
// Availability row (FULL_DAY, MORNING, AFTERNOON) the person has in
// [startDate, endDate], so each day falls back to what resolveDay() says
// without an override: their shift, else the standing pattern or holiday.
// Shifts are never touched here — they're the source of truth for shift
// coverage and change only on /schedule/shifts — so the response lists the
// shift dates in range for the UI to point at.
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
    const result = clearAvailabilitySchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", fieldErrors: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { personId, startDate, endDate } = result.data;
    const start = dateOnly(startDate);
    const end = dateOnly(endDate);
    const dayCount = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    if (dayCount > MAX_RANGE_DAYS) {
      return NextResponse.json({ error: `Range too large — max ${MAX_RANGE_DAYS} days` }, { status: 400 });
    }

    const person = await prisma.person.findUnique({ where: { id: personId }, select: { id: true } });
    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    const [deleted, shifts] = await prisma.$transaction([
      prisma.availability.deleteMany({ where: { personId, date: { gte: start, lte: end } } }),
      prisma.shiftAssignment.findMany({
        where: { personId, date: { gte: start, lte: end } },
        select: { date: true },
        orderBy: { date: "asc" },
      }),
    ]);

    return NextResponse.json({
      cleared: deleted.count,
      shiftDates: Array.from(new Set(shifts.map((s) => toDateString(s.date)))),
    });
  } catch (error) {
    console.error("POST /api/schedule/availability/clear error:", error);
    return NextResponse.json({ error: "Failed to clear availability" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateShiftAssignmentSchema } from "@/lib/validations";
import { canEditSchedule } from "@/lib/utils";
import { isPlainWorkingSet } from "@/lib/schedule";
import { checkWriteLimit, requireJSON, prismaErrorCode } from "@/lib/api-helpers";

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> };

// Only the note is editable in place — date/shiftRole/personId are the
// row's identity; reassigning any of those is a delete-and-recreate (via
// the POST route), not a PATCH.
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !canEditSchedule(session.user.appRole)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const limited = checkWriteLimit(session.user.id);
    if (limited) return limited;

    const jsonError = requireJSON(request);
    if (jsonError) return jsonError;

    const { id } = await params;

    const body = await request.json();
    const result = updateShiftAssignmentSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", fieldErrors: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const assignment = await prisma.shiftAssignment.update({
      where: { id },
      data: { note: result.data.note },
    });

    return NextResponse.json(assignment);
  } catch (error: unknown) {
    if (prismaErrorCode(error) === "P2025") {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }
    console.error("PATCH /api/schedule/shifts/[id] error:", error);
    return NextResponse.json({ error: "Failed to update assignment" }, { status: 500 });
  }
}

// Removes one shift assignment, and — when it's safe to assume the
// Availability WORKING row alongside it exists solely because of this
// assignment — reverts that row too, so the day falls back to the
// person's standing pattern/holiday baseline instead of silently staying
// "working" after the shift that justified it is gone. "Safe" means both:
//   (1) the row is still the exact plain, note-free WORKING row a shift
//       assignment would have written (same test POST uses to decide
//       whether it's safe to overwrite) — anything else means someone
//       hand-edited it for a different reason since, and reverting it out
//       from under them would silently discard that edit; and
//   (2) no other ShiftAssignment for the same person on the same date
//       still exists (a person can hold two roles the same day) — removing
//       one shouldn't undo the working status the other still justifies.
// A stale plain-WORKING row can still linger if two of a person's same-day
// assignments are removed concurrently (each transaction can see the other
// still present and skip the revert) — an accepted, narrow race; the
// fallback is exactly today's baseline behavior (row untouched), not data
// loss.
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !canEditSchedule(session.user.appRole)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const limited = checkWriteLimit(session.user.id);
    if (limited) return limited;

    const { id } = await params;

    const availabilityReverted = await prisma.$transaction(async (tx) => {
      const deleted = await tx.shiftAssignment.delete({ where: { id } });

      const otherSameDayCount = await tx.shiftAssignment.count({
        where: { personId: deleted.personId, date: deleted.date, id: { not: id } },
      });
      if (otherSameDayCount > 0) return false;

      const existing = await tx.availability.findMany({
        where: {
          personId: deleted.personId,
          date: deleted.date,
          segment: { in: ["FULL_DAY", "MORNING", "AFTERNOON"] },
        },
      });
      if (existing.length === 0 || !isPlainWorkingSet(existing)) return false;

      await tx.availability.deleteMany({
        where: {
          personId: deleted.personId,
          date: deleted.date,
          segment: { in: ["FULL_DAY", "MORNING", "AFTERNOON"] },
        },
      });
      return true;
    });

    return NextResponse.json({ success: true, availabilityReverted });
  } catch (error: unknown) {
    if (prismaErrorCode(error) === "P2025") {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }
    console.error("DELETE /api/schedule/shifts/[id] error:", error);
    return NextResponse.json({ error: "Failed to remove assignment" }, { status: 500 });
  }
}

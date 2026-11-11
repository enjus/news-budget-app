import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updatePersonSchema } from "@/lib/validations";
import type { Prisma } from "@prisma/client";
import { canCreateContent, canManageRoster, dateOnly, todayString } from "@/lib/utils";
import { isPlainWorkingSet } from "@/lib/schedule";
import { planPersonPatch } from "@/lib/person-patch";
import { checkWriteLimit, prismaErrorCode } from "@/lib/api-helpers";

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Deletes a person's shifts from tomorrow on — today's and earlier stay as
 * the record of who covered them. Mirrors DELETE /api/schedule/shifts/[id]:
 * when a shift was assigned with writeWorkingRow, a plain "Working"
 * Availability row was written for that date, so it's removed too (only when
 * the day's rows are exactly that plain working set, never a real override).
 * Every upcoming shift of theirs goes, so no other same-day shift remains.
 */
async function removeUpcomingShifts(tx: Prisma.TransactionClient, personId: string) {
  const tomorrow = dateOnly(todayString());
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const shifts = await tx.shiftAssignment.findMany({
    where: { personId, date: { gte: tomorrow } },
    select: { date: true },
  });
  if (shifts.length === 0) return;
  await tx.shiftAssignment.deleteMany({ where: { personId, date: { gte: tomorrow } } });

  const dates = [...new Map(shifts.map((s) => [s.date.getTime(), s.date])).values()];
  const segments = { in: ["FULL_DAY", "MORNING", "AFTERNOON"] };
  for (const date of dates) {
    const rows = await tx.availability.findMany({ where: { personId, date, segment: segments } });
    if (rows.length > 0 && isPlainWorkingSet(rows)) {
      await tx.availability.deleteMany({ where: { personId, date, segment: segments } });
    }
  }
}

/** A rule check that failed inside PATCH's transaction — rolls it back and
 *  becomes this status/message instead of a 500. */
class PatchRejected extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fieldErrors?: Record<string, string[]>
  ) {
    super(message);
  }
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;

    const person = await prisma.person.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            assignments: true,
            videoAssignments: true,
          },
        },
      },
    });

    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    return NextResponse.json(person);
  } catch (error) {
    console.error("GET /api/people/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch person" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !canCreateContent(session.user.appRole)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const limited = checkWriteLimit(session.user.id);
    if (limited) return limited;

    const { id } = await params;
    const body = await request.json();
    const result = updatePersonSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", fieldErrors: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // The staff/contributor rules live in planPersonPatch() (unit-tested in
    // person-patch.test.ts); they're applied to the person's state *before*
    // this write. That state is read inside the transaction after taking the
    // row lock (a no-op updateMany on updatedAt), so a concurrent PATCH — or a
    // concurrent PUT /api/roster/[id]/location, which re-checks isActive
    // under the same lock — can't change it between the check and the write.
    const isAdmin = canManageRoster(session.user.appRole);
    const person = await prisma.$transaction(async (tx) => {
      const { count } = await tx.person.updateMany({ where: { id }, data: { updatedAt: new Date() } });
      if (count === 0) throw new PatchRejected(404, "Person not found");
      const current = await tx.person.findUniqueOrThrow({
        where: { id },
        select: { isStaff: true, email: true },
      });

      const plan = planPersonPatch(current, result.data, isAdmin);
      if (!plan.ok) throw new PatchRejected(plan.status, plan.error, plan.fieldErrors);

      const updated = await tx.person.update({
        where: { id },
        data: plan.data,
        include: {
          _count: {
            select: {
              assignments: true,
              videoAssignments: true,
            },
          },
        },
      });
      // A deactivated staffer's personal contact details are deleted; a
      // contributor's are kept (it's all the contact info the newsroom has
      // for them). Not restored on reactivation. See docs/roster.md.
      if (plan.deletePrivate) {
        await tx.personPrivate.deleteMany({ where: { personId: id } });
      }
      // Only staff have a regular work week or shifts (the work-schedule and
      // shifts APIs refuse contributors), so leaving staff removes both.
      if (plan.leavingStaff) {
        await tx.workSchedule.deleteMany({ where: { personId: id } });
        await removeUpcomingShifts(tx, id);
      }
      return updated;
    });

    return NextResponse.json(person);
  } catch (error: unknown) {
    if (error instanceof PatchRejected) {
      return NextResponse.json(
        { error: error.message, ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}) },
        { status: error.status }
      );
    }
    if (prismaErrorCode(error) === "P2025") {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }
    if (prismaErrorCode(error) === "P2002") {
      return NextResponse.json({ error: "A person with that email already exists" }, { status: 409 });
    }
    console.error("PATCH /api/people/[id] error:", error);
    return NextResponse.json({ error: "Failed to update person" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    // Record deletion is admin work (/admin/people), like the staff/active toggles.
    const session = await getServerSession(authOptions);
    if (!session?.user || !canManageRoster(session.user.appRole)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const limited = checkWriteLimit(session.user.id);
    if (limited) return limited;

    const { id } = await params;

    const person = await prisma.person.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            assignments: true,
            videoAssignments: true,
          },
        },
      },
    });

    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    if (person._count.assignments > 0 || person._count.videoAssignments > 0) {
      return NextResponse.json(
        { error: "Cannot delete person with existing assignments. Remove assignments first." },
        { status: 409 }
      );
    }

    await prisma.person.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (prismaErrorCode(error) === "P2025") {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }
    console.error("DELETE /api/people/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete person" }, { status: 500 });
  }
}

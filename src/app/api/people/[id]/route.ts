import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updatePersonSchema } from "@/lib/validations";
import { canCreateContent, canManageRoster, dateOnly, todayString } from "@/lib/utils";
import { checkWriteLimit, prismaErrorCode } from "@/lib/api-helpers";

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> };

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

    if (result.data.isActive !== undefined && !canManageRoster(session.user.appRole)) {
      return NextResponse.json({ error: "Only admins can change active status" }, { status: 403 });
    }

    if (result.data.isStaff !== undefined && !canManageRoster(session.user.appRole)) {
      return NextResponse.json({ error: "Only admins can change staff status" }, { status: 403 });
    }

    // Every staff/contributor decision below depends on the person's state
    // *before* this write, so it's read inside the transaction with the row
    // locked (SELECT … FOR UPDATE): a concurrent PATCH, or a concurrent PUT
    // /api/roster/[id]/location (which re-checks isActive under the same
    // lock), can't change it between the check and the write. Reading it
    // back after the update instead would let a combined
    // { isStaff: false, isActive: false } skip the staff-only cleanup.
    const isAdmin = canManageRoster(session.user.appRole);
    const person = await prisma.$transaction(async (tx) => {
      const [current] = await tx.$queryRaw<{ isStaff: boolean; email: string | null }[]>`
        SELECT "isStaff", "email" FROM "Person" WHERE "id" = ${id} FOR UPDATE`;
      if (!current) throw new PatchRejected(404, "Person not found");

      // A staffer's name, work email (the notification address) and default
      // role are admin-managed (/admin/people), matching PATCH
      // /api/roster/[id]. Contributors' stay editable by any content creator.
      const { name, email, defaultRole } = result.data;
      if (
        current.isStaff &&
        !isAdmin &&
        (name !== undefined || email !== undefined || defaultRole !== undefined)
      ) {
        throw new PatchRejected(403, "A staff member's name, work email and default role are managed by admins");
      }

      // A staffer's work email is their company address, which a contributor
      // never has. So leaving staff clears it unless the same request
      // supplies a replacement (their own professional address). Only on an
      // actual staff → contributor change: repeating isStaff: false must not
      // wipe a contributor's own work email.
      const data = { ...result.data };
      const leavingStaff = current.isStaff && data.isStaff === false;
      const joiningStaff = !current.isStaff && data.isStaff === true;
      if (leavingStaff && data.email === undefined) {
        data.email = null;
      }

      // Staff must keep a work email — it's where their notifications go.
      // Checked only when this request changes the email or adds to staff,
      // so an older staff record with no email can still be deactivated or
      // renamed (PersonForm re-sends the unchanged blank email on save).
      const emailChanged = data.email !== undefined && data.email !== current.email;
      const staffAfter = data.isStaff ?? current.isStaff;
      const emailAfter = data.email !== undefined ? data.email : current.email;
      if ((emailChanged || joiningStaff) && staffAfter && !emailAfter) {
        throw new PatchRejected(400, "Staff need a work email", { email: ["Staff need a work email"] });
      }

      // Marking a staffer inactive (typically: they've left) deletes their
      // roster personal contact details (PersonPrivate) — a former
      // employee's home address and personal phone shouldn't linger. A
      // contributor's PersonPrivate is kept: it's all the contact info the
      // newsroom has for them, and freelancers come and go. Not restored on
      // reactivation; they re-enter it. See docs/roster.md.
      // Leaving staff also deletes their regular work week and their
      // upcoming shift assignments — only staff have either (the
      // work-schedule and shifts APIs refuse contributors). Past shifts are
      // kept as history.
      const updated = await tx.person.update({
        where: { id },
        data,
        include: {
          _count: {
            select: {
              assignments: true,
              videoAssignments: true,
            },
          },
        },
      });
      // Was staff before this write, or still is: a staffer leaving and being
      // deactivated in one request still loses their personal details.
      if (data.isActive === false && (current.isStaff || updated.isStaff)) {
        await tx.personPrivate.deleteMany({ where: { personId: id } });
      }
      if (leavingStaff) {
        await tx.workSchedule.deleteMany({ where: { personId: id } });
        await tx.shiftAssignment.deleteMany({
          where: { personId: id, date: { gte: dateOnly(todayString()) } },
        });
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

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateShiftAssignmentSchema } from "@/lib/validations";
import { canEditSchedule } from "@/lib/utils";
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

// Removes one shift assignment. Nothing else to undo: assigning a shift
// writes no Availability row, so the day simply falls back to whatever
// resolveDay() says without it.
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !canEditSchedule(session.user.appRole)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const limited = checkWriteLimit(session.user.id);
    if (limited) return limited;

    const { id } = await params;

    await prisma.shiftAssignment.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (prismaErrorCode(error) === "P2025") {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }
    console.error("DELETE /api/schedule/shifts/[id] error:", error);
    return NextResponse.json({ error: "Failed to remove assignment" }, { status: 500 });
  }
}

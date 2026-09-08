import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canEditSchedule } from "@/lib/utils";
import { checkWriteLimit, prismaErrorCode } from "@/lib/api-helpers";

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> };

// Removes one shift assignment. Deliberately does not touch any Availability
// WORKING row written alongside it at assignment time — reverting that
// automatically risks deleting a row someone has since edited for other
// reasons; removing a shift assignment isn't the same claim as "this person
// is no longer working that day."
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

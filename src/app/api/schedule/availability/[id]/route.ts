import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateAvailabilitySchema } from "@/lib/validations";
import { canEditSchedule } from "@/lib/utils";
import { checkWriteLimit, requireJSON, prismaErrorCode } from "@/lib/api-helpers";

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> };

// Only status/note are editable in place — personId/date/segment are the
// row's identity; changing those is a delete-and-recreate (via the range or
// week routes), not a PATCH.
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
    const result = updateAvailabilitySchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", fieldErrors: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const entry = await prisma.availability.update({
      where: { id },
      data: { ...result.data, updatedByUserId: session.user.id },
    });

    return NextResponse.json(entry);
  } catch (error: unknown) {
    if (prismaErrorCode(error) === "P2025") {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }
    console.error("PATCH /api/schedule/availability/[id] error:", error);
    return NextResponse.json({ error: "Failed to update entry" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !canEditSchedule(session.user.appRole)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const limited = checkWriteLimit(session.user.id);
    if (limited) return limited;

    const { id } = await params;
    await prisma.availability.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (prismaErrorCode(error) === "P2025") {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }
    console.error("DELETE /api/schedule/availability/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete entry" }, { status: 500 });
  }
}

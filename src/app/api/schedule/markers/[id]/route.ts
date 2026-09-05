import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateMarkerSchema } from "@/lib/validations";
import { canManageRoster, dateOnly } from "@/lib/utils";
import { checkWriteLimit, requireJSON, prismaErrorCode } from "@/lib/api-helpers";

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !canManageRoster(session.user.appRole)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const limited = checkWriteLimit(session.user.id);
    if (limited) return limited;

    const jsonError = requireJSON(request);
    if (jsonError) return jsonError;

    const { id } = await params;

    const body = await request.json();
    const result = updateMarkerSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", fieldErrors: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { startDate, endDate, ...rest } = result.data;
    const marker = await prisma.calendarMarker.update({
      where: { id },
      data: {
        ...rest,
        ...(startDate ? { startDate: dateOnly(startDate) } : {}),
        ...(endDate ? { endDate: dateOnly(endDate) } : {}),
      },
    });

    return NextResponse.json(marker);
  } catch (error: unknown) {
    if (prismaErrorCode(error) === "P2025") {
      return NextResponse.json({ error: "Marker not found" }, { status: 404 });
    }
    console.error("PATCH /api/schedule/markers/[id] error:", error);
    return NextResponse.json({ error: "Failed to update marker" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !canManageRoster(session.user.appRole)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const limited = checkWriteLimit(session.user.id);
    if (limited) return limited;

    const { id } = await params;
    await prisma.calendarMarker.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (prismaErrorCode(error) === "P2025") {
      return NextResponse.json({ error: "Marker not found" }, { status: 404 });
    }
    console.error("DELETE /api/schedule/markers/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete marker" }, { status: 500 });
  }
}

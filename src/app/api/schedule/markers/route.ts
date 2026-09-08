import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createMarkerSchema, CalendarMarkerKindEnum } from "@/lib/validations";
import { canManageRoster, dateOnly } from "@/lib/utils";
import { checkWriteLimit, requireJSON } from "@/lib/api-helpers";

export const dynamic = 'force-dynamic'

// GET ?start=&end=&kind= — markers covering a window, inclusive on both
// ends (endDate uses lte, not lt — see CalendarMarker's schema comment).
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    const kind = searchParams.get("kind");

    if (kind && !CalendarMarkerKindEnum.safeParse(kind).success) {
      return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
    }

    const where: Record<string, unknown> = {};
    if (start && end) {
      where.startDate = { lte: dateOnly(end) };
      where.endDate = { gte: dateOnly(start) };
    }
    if (kind) where.kind = kind;

    const markers = await prisma.calendarMarker.findMany({
      where,
      orderBy: { startDate: "asc" },
    });

    return NextResponse.json(markers);
  } catch (error) {
    console.error("GET /api/schedule/markers error:", error);
    return NextResponse.json({ error: "Failed to fetch markers" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !canManageRoster(session.user.appRole)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const limited = checkWriteLimit(session.user.id);
    if (limited) return limited;

    const jsonError = requireJSON(request);
    if (jsonError) return jsonError;

    const body = await request.json();
    const result = createMarkerSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", fieldErrors: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const marker = await prisma.calendarMarker.create({
      data: {
        kind: result.data.kind,
        label: result.data.label,
        startDate: dateOnly(result.data.startDate),
        endDate: dateOnly(result.data.endDate),
        note: result.data.note ?? null,
        observed: result.data.observed,
        createdByUserId: session.user.id,
      },
    });

    return NextResponse.json(marker, { status: 201 });
  } catch (error) {
    console.error("POST /api/schedule/markers error:", error);
    return NextResponse.json({ error: "Failed to create marker" }, { status: 500 });
  }
}

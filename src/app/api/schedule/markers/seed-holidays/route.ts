import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { seedHolidaysSchema } from "@/lib/validations";
import { canManageRoster, dateOnly } from "@/lib/utils";
import { standardUsHolidays } from "@/lib/schedule";
import { checkWriteLimit, requireJSON } from "@/lib/api-helpers";

export const dynamic = 'force-dynamic'

// Seeds the standard US federal holiday set for a year as editable/deletable
// CalendarMarker rows — a starting point, not an authority (issue #19 §3).
// A batch route rather than N sequential client-side POSTs, so a network
// blip can't leave a half-seeded year.
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
    const result = seedHolidaysSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", fieldErrors: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const holidays = standardUsHolidays(result.data.year);
    await prisma.calendarMarker.createMany({
      data: holidays.map((h) => ({
        kind: "HOLIDAY",
        label: h.label,
        startDate: dateOnly(h.date),
        endDate: dateOnly(h.date),
        observed: true,
        createdByUserId: session.user.id,
      })),
    });

    const markers = await prisma.calendarMarker.findMany({
      where: {
        kind: "HOLIDAY",
        startDate: { gte: dateOnly(`${result.data.year}-01-01`), lte: dateOnly(`${result.data.year}-12-31`) },
      },
      orderBy: { startDate: "asc" },
    });

    return NextResponse.json(markers, { status: 201 });
  } catch (error) {
    console.error("POST /api/schedule/markers/seed-holidays error:", error);
    return NextResponse.json({ error: "Failed to seed holidays" }, { status: 500 });
  }
}

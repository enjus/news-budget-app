import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { replaceWorkScheduleSchema } from "@/lib/validations";
import { canManageRoster } from "@/lib/utils";
import { checkWriteLimit, prismaErrorCode } from "@/lib/api-helpers";

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;

    const days = await prisma.workSchedule.findMany({
      where: { personId: id },
      select: { weekday: true, segment: true },
      orderBy: { weekday: "asc" },
    });

    return NextResponse.json(days);
  } catch (error) {
    console.error("GET /api/people/[id]/work-schedule error:", error);
    return NextResponse.json({ error: "Failed to fetch work schedule" }, { status: 500 });
  }
}

// Full replace, not a partial patch: the client sends only the rows that
// differ from the Mon–Fri default (see diffFromDefaultWeek() in
// src/lib/utils.ts), and this route replaces the person's entire
// WorkSchedule set with exactly what's sent — "no rows" means "back to the
// Mon–Fri default." A transaction avoids delete/insert bookkeeping bugs.
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !canManageRoster(session.user.appRole)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const limited = checkWriteLimit(session.user.id);
    if (limited) return limited;

    const { id } = await params;

    const person = await prisma.person.findUnique({ where: { id }, select: { id: true } });
    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    const body = await request.json();
    const result = replaceWorkScheduleSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", fieldErrors: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const days = await prisma.$transaction(async (tx) => {
      await tx.workSchedule.deleteMany({ where: { personId: id } });
      if (result.data.days.length > 0) {
        await tx.workSchedule.createMany({
          data: result.data.days.map((d) => ({ personId: id, weekday: d.weekday, segment: d.segment })),
        });
      }
      return tx.workSchedule.findMany({
        where: { personId: id },
        select: { weekday: true, segment: true },
        orderBy: { weekday: "asc" },
      });
    });

    return NextResponse.json(days);
  } catch (error: unknown) {
    if (prismaErrorCode(error) === "P2025") {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }
    console.error("PATCH /api/people/[id]/work-schedule error:", error);
    return NextResponse.json({ error: "Failed to update work schedule" }, { status: 500 });
  }
}

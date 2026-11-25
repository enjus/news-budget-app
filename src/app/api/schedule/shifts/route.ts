import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createShiftAssignmentSchema } from "@/lib/validations";
import { canEditSchedule, dateOnly, toDateString, SHIFT_ROLES } from "@/lib/utils";
import { clampToScheduleStart, resolveDay, detectShiftConflict, describeShiftConflict, shiftDaysInWindow, mergeShiftDays, type AvailabilityEntry } from "@/lib/schedule";
import { loadScheduleWindow } from "@/lib/schedule-queries";
import { checkWriteLimit, requireJSON, prismaErrorCode } from "@/lib/api-helpers";

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 400; // a ~6-month rotation season (§6) plus buffer

// GET: shift days in [start, end] — every Saturday/Sunday plus observed
// holidays — each with its 4 role slots, assignees, and conflict warnings.
// Read-open, matching /api/schedule/day and /week (middleware already gates
// all non-auth routes; see CLAUDE.md's "reads are open" rule).
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedStart = searchParams.get("start");
    const end = searchParams.get("end");

    if (!requestedStart || !DATE_RE.test(requestedStart) || !end || !DATE_RE.test(end)) {
      return NextResponse.json({ error: "start and end (YYYY-MM-DD) are required" }, { status: 400 });
    }
    if (end < requestedStart) {
      return NextResponse.json({ error: "end must be on or after start" }, { status: 400 });
    }
    // Issue #85: nothing before the cutover is tracked here.
    const start = clampToScheduleStart(requestedStart);
    if (end < start) {
      return NextResponse.json({ start, end, roster: [], days: [] });
    }

    const startDate = dateOnly(start);
    const endDate = dateOnly(end);
    const dayCount = Math.round((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    if (dayCount > MAX_RANGE_DAYS) {
      return NextResponse.json({ error: `Range too large — max ${MAX_RANGE_DAYS} days` }, { status: 400 });
    }

    const [{ roster, availabilityByPerson, workScheduleByPerson, markers }, assignments] = await Promise.all([
      loadScheduleWindow(startDate, endDate, ["HOLIDAY"]),
      prisma.shiftAssignment.findMany({
        where: { date: { gte: startDate, lte: endDate } },
        include: { person: { select: { id: true, name: true } } },
      }),
    ]);

    const assignmentsByDate = new Map<string, typeof assignments>();
    for (const a of assignments) {
      const key = toDateString(a.date);
      const list = assignmentsByDate.get(key) ?? [];
      list.push(a);
      assignmentsByDate.set(key, list);
    }

    // Any date with a real ShiftAssignment stays visible even when it isn't
    // a weekend or observed holiday — an ad-hoc coverage day (e.g. a
    // weeknight protest) added directly by assigning someone to it. See
    // mergeShiftDays() in src/lib/schedule.ts.
    const shiftDays = mergeShiftDays(
      shiftDaysInWindow(startDate, endDate, markers),
      Array.from(assignmentsByDate.keys())
    );

    const days = shiftDays.map((day) => {
      const forDate = assignmentsByDate.get(day.date) ?? [];
      const roles: Record<string, unknown[]> = {};
      for (const role of SHIFT_ROLES) {
        roles[role] = forDate
          .filter((a) => a.shiftRole === role)
          .map((a) => {
            const rows = availabilityByPerson.get(a.personId) ?? [];
            const entries: AvailabilityEntry[] = rows.map((r) => ({
              date: toDateString(r.date),
              segment: r.segment,
              status: r.status,
            }));
            const personWorkSchedule = workScheduleByPerson.get(a.personId) ?? [];
            const shifts = forDate.filter((f) => f.personId === a.personId).map((f) => ({ date: day.date, shiftRole: f.shiftRole }));
            const resolved = resolveDay(dateOnly(day.date), entries, personWorkSchedule, markers, shifts);
            return {
              id: a.id,
              personId: a.personId,
              name: a.person.name,
              note: a.note,
              conflict: describeShiftConflict(detectShiftConflict(resolved), a.person.name),
            };
          });
      }
      return { date: day.date, holiday: day.holiday, adHoc: day.adHoc, roles };
    });

    return NextResponse.json({
      start,
      end,
      roster: roster.map((p) => ({ id: p.id, name: p.name })),
      days,
    });
  } catch (error) {
    console.error("GET /api/schedule/shifts error:", error);
    return NextResponse.json({ error: "Failed to fetch shifts" }, { status: 500 });
  }
}

// POST: assign one person to one role slot on one date. Writes only the
// ShiftAssignment: shifts are the source of truth for shift coverage, and
// every schedule view reads them through resolveDay() — there's no matching
// Availability row to keep in step.
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !canEditSchedule(session.user.appRole)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const limited = checkWriteLimit(session.user.id);
    if (limited) return limited;

    const jsonError = requireJSON(request);
    if (jsonError) return jsonError;

    const body = await request.json();
    const result = createShiftAssignmentSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", fieldErrors: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { date, shiftRole, personId, note } = result.data;

    const person = await prisma.person.findUnique({ where: { id: personId }, select: { id: true, isStaff: true } });
    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }
    // The shift picker lists the staff roster only (ROSTER_WHERE); enforce it.
    if (!person.isStaff) {
      return NextResponse.json({ error: "Only staff can be assigned a shift" }, { status: 400 });
    }

    const dateObj = dateOnly(date);

    const assignment = await prisma.shiftAssignment.create({
      data: { date: dateObj, shiftRole, personId, note: note ?? null, createdByUserId: session.user.id },
      include: { person: { select: { id: true, name: true } } },
    });

    return NextResponse.json(assignment, { status: 201 });
  } catch (error: unknown) {
    if (prismaErrorCode(error) === "P2002") {
      return NextResponse.json({ error: "Already assigned to this shift" }, { status: 409 });
    }
    if (prismaErrorCode(error) === "P2025") {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }
    console.error("POST /api/schedule/shifts error:", error);
    return NextResponse.json({ error: "Failed to assign shift" }, { status: 500 });
  }
}

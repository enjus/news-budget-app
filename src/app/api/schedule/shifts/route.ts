import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createShiftAssignmentSchema } from "@/lib/validations";
import { canEditSchedule, dateOnly, toDateString, SHIFT_ROLES } from "@/lib/utils";
import { resolveDay, detectShiftConflict, describeShiftConflict, shiftDaysInWindow, mergeShiftDays, type AvailabilityEntry } from "@/lib/schedule";
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
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    if (!start || !DATE_RE.test(start) || !end || !DATE_RE.test(end)) {
      return NextResponse.json({ error: "start and end (YYYY-MM-DD) are required" }, { status: 400 });
    }
    if (end < start) {
      return NextResponse.json({ error: "end must be on or after start" }, { status: 400 });
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
            const resolved = resolveDay(dateOnly(day.date), entries, personWorkSchedule, markers);
            const weekdayLabel = new Date(`${day.date}T00:00:00.000Z`).toLocaleDateString("en-US", {
              weekday: "long",
              timeZone: "UTC",
            });
            return {
              id: a.id,
              personId: a.personId,
              name: a.person.name,
              note: a.note,
              conflict: describeShiftConflict(detectShiftConflict(resolved), a.person.name, weekdayLabel),
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

// POST: assign one person to one role slot on one date. Optionally writes
// the matching Availability FULL_DAY/WORKING row (issue #19 §6) so the
// person shows as working everywhere else, using the same delete-then-create
// shape POST /api/schedule/availability uses, scoped to one date/person.
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

    const { date, shiftRole, personId, note, writeWorkingRow } = result.data;

    const person = await prisma.person.findUnique({ where: { id: personId }, select: { id: true } });
    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    const dateObj = dateOnly(date);

    const { assignment, workingRowSkipped } = await prisma.$transaction(async (tx) => {
      const created = await tx.shiftAssignment.create({
        data: { date: dateObj, shiftRole, personId, note: note ?? null, createdByUserId: session.user.id },
        include: { person: { select: { id: true, name: true } } },
      });

      let skipped = false;
      if (writeWorkingRow) {
        // Don't silently clobber an existing OUT/UNAVAILABLE entry (or one
        // carrying a note) — that's the exact "lost notes, silent no-op" bug
        // class already fixed once on this branch for the availability
        // write path. Only overwrite when the existing rows are themselves
        // already a plain, note-free WORKING day (or there's nothing there).
        const existing = await tx.availability.findMany({
          where: { personId, date: dateObj, segment: { in: ["FULL_DAY", "MORNING", "AFTERNOON"] } },
        });
        const conflicts = existing.some((r) => r.status !== "WORKING" || r.note);
        if (conflicts) {
          skipped = true;
        } else {
          await tx.availability.deleteMany({
            where: { personId, date: dateObj, segment: { in: ["FULL_DAY", "MORNING", "AFTERNOON"] } },
          });
          await tx.availability.create({
            data: {
              personId,
              date: dateObj,
              segment: "FULL_DAY",
              status: "WORKING",
              createdByUserId: session.user.id,
              updatedByUserId: session.user.id,
            },
          });
        }
      }

      return { assignment: created, workingRowSkipped: skipped };
    });

    return NextResponse.json({ ...assignment, workingRowSkipped }, { status: 201 });
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

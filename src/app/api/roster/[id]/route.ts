import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateRosterProfileSchema } from "@/lib/validations";
import { canEditRosterProfile } from "@/lib/utils";
import {
  checkReadLimit,
  checkWriteLimit,
  prismaErrorCode,
  requireJSON,
  validationErrorResponse,
} from "@/lib/api-helpers";
import { PRIVATE_CONTACT_FIELDS, ROSTER_PROFILE_SELECT } from "@/lib/roster-query";

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> };

// One roster profile, including personal contact details (PersonPrivate).
// Any signed-in user may read it: the roster is trust-based, and the "not for
// public distribution" reminder is a client-side courtesy, not a gate here.
export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const limited = checkReadLimit(session.user.id);
    if (limited) return limited;

    const { id } = await params;
    const person = await prisma.person.findUnique({
      where: { id },
      select: ROSTER_PROFILE_SELECT,
    });

    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    return NextResponse.json(person, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/roster/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}

// Self-or-admin edit of the roster fields. Public fields update Person;
// `private`, when present, upserts the PersonPrivate row in the same write.
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await params;
    if (!canEditRosterProfile(session.user.appRole, session.user.personId, id)) {
      return NextResponse.json(
        { error: "You can only edit your own roster profile" },
        { status: 403 }
      );
    }

    const limited = checkWriteLimit(session.user.id);
    if (limited) return limited;

    const badType = requireJSON(request);
    if (badType) return badType;

    const result = updateRosterProfileSchema.safeParse(await request.json());
    if (!result.success) return validationErrorResponse(result.error);

    const { private: privateData, ...publicData } = result.data;

    // The form always sends `private`. All-blank means "no contact details":
    // drop the row rather than keeping an empty one, so a PersonPrivate row
    // existing always means there's something in it. A row holding a map pin
    // isn't empty, though — the form never sends coordinates (they're written
    // by /location), so clear just the contact fields and keep the pin.
    const privateIsEmpty =
      !!privateData && Object.values(privateData).every((v) => v === null || v === undefined);

    const person = await prisma.$transaction(async (tx) => {
      if (privateIsEmpty) {
        const existing = await tx.personPrivate.findUnique({
          where: { personId: id },
          select: { latitude: true },
        });
        if (existing?.latitude != null) {
          await tx.personPrivate.update({
            where: { personId: id },
            data: Object.fromEntries(PRIVATE_CONTACT_FIELDS.map((f) => [f, null])),
          });
        } else {
          await tx.personPrivate.deleteMany({ where: { personId: id } });
        }
      }
      return tx.person.update({
        where: { id },
        data: {
          ...publicData,
          ...(privateData && !privateIsEmpty
            ? { private: { upsert: { create: privateData, update: privateData } } }
            : {}),
        },
        select: ROSTER_PROFILE_SELECT,
      });
    });

    return NextResponse.json(person);
  } catch (error: unknown) {
    if (prismaErrorCode(error) === "P2025") {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }
    console.error("PATCH /api/roster/[id] error:", error);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}

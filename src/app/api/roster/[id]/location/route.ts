import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rosterLocationSchema } from "@/lib/validations";
import { canEditRosterProfile } from "@/lib/utils";
import {
  checkWriteLimit,
  requireJSON,
  validationErrorResponse,
} from "@/lib/api-helpers";
import { PRIVATE_CONTACT_FIELDS, ROSTER_PROFILE_SELECT } from "@/lib/roster-query";
import { roundCoord } from "@/lib/roster-map";

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> };

// A person's hand-placed roster map pin (PersonPrivate.latitude/longitude).
// Its own route rather than part of PATCH /api/roster/[id] so the profile
// form, which always sends a full `private` object, can never clear it.
// Same self-or-admin gate as the profile. Inactive people are never mapped.

type Gate =
  | { error: NextResponse }
  | { error: null };

async function gate(id: string): Promise<Gate> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }
  if (!canEditRosterProfile(session.user.appRole, session.user.personId, id)) {
    return {
      error: NextResponse.json(
        { error: "You can only edit your own map location" },
        { status: 403 }
      ),
    };
  }
  const limited = checkWriteLimit(session.user.id);
  if (limited) return { error: limited };

  const person = await prisma.person.findUnique({ where: { id }, select: { isActive: true } });
  if (!person) {
    return { error: NextResponse.json({ error: "Person not found" }, { status: 404 }) };
  }
  if (!person.isActive) {
    return {
      error: NextResponse.json({ error: "Inactive people can't be mapped" }, { status: 400 }),
    };
  }
  return { error: null };
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const { error } = await gate(id);
    if (error) return error;

    const badType = requireJSON(request);
    if (badType) return badType;

    const result = rosterLocationSchema.safeParse(await request.json());
    if (!result.success) return validationErrorResponse(result.error);

    const data = {
      latitude: roundCoord(result.data.latitude),
      longitude: roundCoord(result.data.longitude),
      locationUpdatedAt: new Date(),
    };

    const person = await prisma.person.update({
      where: { id },
      data: { private: { upsert: { create: data, update: data } } },
      select: ROSTER_PROFILE_SELECT,
    });

    return NextResponse.json(person);
  } catch (error) {
    console.error("PUT /api/roster/[id]/location error:", error);
    return NextResponse.json({ error: "Failed to save location" }, { status: 500 });
  }
}

// Removes the pin. If the row then holds nothing else, it's deleted, keeping
// the "a PersonPrivate row always has a value" rule from the profile PATCH.
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const { error } = await gate(id);
    if (error) return error;

    const person = await prisma.$transaction(async (tx) => {
      const row = await tx.personPrivate.findUnique({ where: { personId: id } });
      if (row) {
        const hasContact = PRIVATE_CONTACT_FIELDS.some((f) => row[f] !== null);
        if (hasContact) {
          await tx.personPrivate.update({
            where: { personId: id },
            data: { latitude: null, longitude: null, locationUpdatedAt: null },
          });
        } else {
          await tx.personPrivate.delete({ where: { personId: id } });
        }
      }
      return tx.person.findUniqueOrThrow({ where: { id }, select: ROSTER_PROFILE_SELECT });
    });

    return NextResponse.json(person);
  } catch (error) {
    console.error("DELETE /api/roster/[id]/location error:", error);
    return NextResponse.json({ error: "Failed to remove location" }, { status: 500 });
  }
}

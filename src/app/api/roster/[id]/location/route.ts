import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rosterLocationSchema } from "@/lib/validations";
import { canEditRosterProfile } from "@/lib/utils";
import {
  checkWriteLimit,
  requireJSON,
  validationErrorResponse,
} from "@/lib/api-helpers";
import { ROSTER_PROFILE_SELECT } from "@/lib/roster-query";
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
  if (!person.isActive) return { error: inactiveResponse() };
  return { error: null };
}

function inactiveResponse() {
  return NextResponse.json({ error: "Inactive people can't be mapped" }, { status: 400 });
}

class InactiveError extends Error {}

// Re-checks isActive while taking the Person row lock (a no-op write), so a
// concurrent deactivation — which updates Person before deleting
// PersonPrivate, see PATCH /api/people/[id] — either waits for this write and
// then deletes the pin, or commits first and makes this write bail out.
async function lockActivePerson(tx: Prisma.TransactionClient, id: string) {
  const { count } = await tx.person.updateMany({
    where: { id, isActive: true },
    data: { isActive: true },
  });
  if (count === 0) throw new InactiveError();
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

    const person = await prisma.$transaction(async (tx) => {
      await lockActivePerson(tx, id);
      return tx.person.update({
        where: { id },
        data: { private: { upsert: { create: data, update: data } } },
        select: ROSTER_PROFILE_SELECT,
      });
    });

    return NextResponse.json(person);
  } catch (error) {
    if (error instanceof InactiveError) return inactiveResponse();
    console.error("PUT /api/roster/[id]/location error:", error);
    return NextResponse.json({ error: "Failed to save location" }, { status: 500 });
  }
}

// Removes the pin. The row stays even if nothing else is in it — an empty
// PersonPrivate row reads the same as no row everywhere.
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const { error } = await gate(id);
    if (error) return error;

    const person = await prisma.$transaction(async (tx) => {
      await tx.personPrivate.updateMany({
        where: { personId: id },
        data: { latitude: null, longitude: null, locationUpdatedAt: null },
      });
      return tx.person.findUniqueOrThrow({ where: { id }, select: ROSTER_PROFILE_SELECT });
    });

    return NextResponse.json(person);
  } catch (error) {
    console.error("DELETE /api/roster/[id]/location error:", error);
    return NextResponse.json({ error: "Failed to remove location" }, { status: 500 });
  }
}

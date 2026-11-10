import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkReadLimit } from "@/lib/api-helpers";
import { isRosterReviewDue } from "@/lib/roster";
import type { RosterStatus } from "@/types/index";

export const dynamic = 'force-dynamic'

// What the sitewide RosterNudges banner needs for the signed-in user, kept to
// two booleans so the banner never loads a profile's contact details. Users
// with no linked Person, or an inactive one, have nothing to be nudged about.
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const limited = checkReadLimit(session.user.id);
    if (limited) return limited;

    const person = session.user.personId
      ? await prisma.person.findUnique({
          where: { id: session.user.personId },
          select: {
            isActive: true,
            rosterReviewedAt: true,
            private: { select: { mapResetAt: true } },
          },
        })
      : null;

    const status: RosterStatus = person?.isActive
      ? {
          reviewDue: isRosterReviewDue(person.rosterReviewedAt, new Date()),
          mapResetPending: !!person.private?.mapResetAt,
        }
      : { reviewDue: false, mapResetPending: false };

    return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/roster/me/status error:", error);
    return NextResponse.json({ error: "Failed to fetch roster status" }, { status: 500 });
  }
}

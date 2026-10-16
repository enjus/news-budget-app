import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkReadLimit } from "@/lib/api-helpers";
import { ROSTER_LIST_SELECT } from "@/lib/roster-query";

export const dynamic = 'force-dynamic'

// The newsroom roster: every active Person's public profile fields, open to
// any signed-in user (the People page, by contrast, is elevated-only).
// Personal contact details are never included here — see GET /api/roster/[id].
// No query filters: the whole newsroom fits in one payload, and RosterView
// filters client-side.
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const limited = checkReadLimit(session.user.id);
    if (limited) return limited;

    const people = await prisma.person.findMany({
      where: { isActive: true },
      select: ROSTER_LIST_SELECT,
      orderBy: { name: "asc" },
      take: 1000,
    });

    return NextResponse.json(people);
  } catch (error) {
    console.error("GET /api/roster error:", error);
    return NextResponse.json({ error: "Failed to fetch roster" }, { status: 500 });
  }
}

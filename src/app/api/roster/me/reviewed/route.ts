import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkWriteLimit } from "@/lib/api-helpers";

export const dynamic = 'force-dynamic'

// "Still accurate" on the review nudge: restarts the six-month clock without a
// profile save. Acts on the session's own Person, so there's no id to gate.
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const limited = checkWriteLimit(session.user.id);
    if (limited) return limited;

    if (!session.user.personId) {
      return NextResponse.json({ error: "No roster profile linked" }, { status: 404 });
    }

    const { count } = await prisma.person.updateMany({
      where: { id: session.user.personId, isActive: true },
      data: { rosterReviewedAt: new Date() },
    });
    if (count === 0) {
      return NextResponse.json({ error: "No active roster profile" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/roster/me/reviewed error:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}

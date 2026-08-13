import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasElevatedAccess } from "@/lib/utils";
import { checkWriteLimit } from "@/lib/api-helpers";

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> };

/** Unclaim — claimed pitch → plain pitch (issue #24 §4, r6). Drops the
 *  claimant's StoryAssignment only; onBudget/pitchedAt/expiresAt are untouched,
 *  since none of them ever changed at claim. Permission: the claimant, or
 *  hasElevatedAccess() removing someone else's claim. */
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const limited = checkWriteLimit(session.user.id);
    if (limited) return limited;

    const { id: storyId } = await params;

    // Optional body: { personId } — removing someone else's claim requires elevated access.
    // Defaults to the caller's own linked person (self-unclaim).
    let targetPersonId: string | null | undefined = session.user.personId;
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => ({}));
      if (typeof body?.personId === "string" && body.personId.length > 0) {
        if (body.personId !== session.user.personId && !hasElevatedAccess(session.user.appRole)) {
          return NextResponse.json({ error: "Not authorized" }, { status: 403 });
        }
        targetPersonId = body.personId;
      }
    }

    if (!targetPersonId) {
      return NextResponse.json({ error: "No linked staff profile to unclaim with" }, { status: 400 });
    }

    const story = await prisma.story.findUnique({
      where: { id: storyId },
      select: { onBudget: true, pitchedAt: true },
    });
    if (!story) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }
    if (story.onBudget || story.pitchedAt === null) {
      return NextResponse.json({ error: "Only a claimed pitch can be unclaimed" }, { status: 400 });
    }

    const deleted = await prisma.storyAssignment.deleteMany({
      where: { storyId, personId: targetPersonId },
    });
    if (deleted.count === 0) {
      return NextResponse.json({ error: "No claim found for that person" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/stories/[id]/unclaim error:", error);
    return NextResponse.json({ error: "Failed to unclaim pitch" }, { status: 500 });
  }
}

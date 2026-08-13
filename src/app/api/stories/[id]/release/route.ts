import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addDays } from "date-fns";
import { canCreateContent } from "@/lib/utils";
import { checkWriteLimit } from "@/lib/api-helpers";

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> };

/** Release — "Return to Pitches" (issue #24 §4). Sends an on-budget, unassigned
 *  DRAFT back to the pool — the remedy for the existing red "Unassigned" chip.
 *  Only reachable from a DRAFT with zero assignments, same guard the chip uses. */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !canCreateContent(session.user.appRole)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const limited = checkWriteLimit(session.user.id);
    if (limited) return limited;

    const { id: storyId } = await params;

    const story = await prisma.story.findUnique({
      where: { id: storyId },
      select: { onBudget: true, status: true, pitchText: true, budgetLine: true, _count: { select: { assignments: true } } },
    });
    if (!story) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }
    if (!story.onBudget || story.status !== "DRAFT" || story._count.assignments > 0) {
      return NextResponse.json(
        { error: "Only an unassigned, on-budget draft can be returned to Pitches" },
        { status: 400 }
      );
    }

    const now = new Date();
    const updated = await prisma.story.update({
      where: { id: storyId },
      data: {
        onBudget: false,
        pitchedAt: now,
        expiresAt: addDays(now, 30),
        onlinePubDate: null,
        onlinePubDateTBD: true,
        // A story created outside the pitch flow never has pitchText set, but
        // the pool UI (PitchRow, PitchBanner) renders pitchText as the item's
        // title with no fallback — fall back to budgetLine so a released
        // story doesn't show up blank.
        pitchText: story.pitchText ?? story.budgetLine,
        version: { increment: 1 },
      },
      select: { id: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("POST /api/stories/[id]/release error:", error);
    return NextResponse.json({ error: "Failed to return story to Pitches" }, { status: 500 });
  }
}

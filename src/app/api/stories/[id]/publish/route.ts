import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkWriteLimit, blockedFromDraft, storyDraftGateSelect, checkVersionConflict } from "@/lib/api-helpers";

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> };

const storyInclude = {
  assignments: { include: { person: true } },
  visuals: { include: { person: true } },
  videos: true,
} as const;

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const limited = checkWriteLimit(session.user.id);
    if (limited) return limited;

    const { id } = await params;

    // Optional body: { version }, for optimistic locking — same pattern as
    // PATCH /api/stories/[id]. Optional (not requireJSON()'d) because an
    // existing caller, MeView's "My Drafts" list, POSTs with no body at all —
    // its list payload doesn't carry a story's version, so it can't send one.
    let clientVersion: number | undefined;
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => ({}));
      if (typeof body?.version === "number") clientVersion = body.version;
    }

    const story = await prisma.story.findUnique({
      where: { id },
      select: storyDraftGateSelect,
    });

    if (!story) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    if (story.onBudget) {
      return NextResponse.json({ error: "Story is already on the budget" }, { status: 400 });
    }

    // A pitch (pitchedAt set) has no slug/budgetLine yet — only send-to-budget
    // rewrites those and clears pitchedAt/expiresAt. Publishing it directly
    // here would flip onBudget while leaving it looking like a pitch forever.
    if (story.pitchedAt) {
      return NextResponse.json(
        { error: "Pitches must be sent to budget, not published directly" },
        { status: 400 }
      );
    }

    // Only the creator, an assignee, or an admin can publish a draft
    if (blockedFromDraft(story, session.user)) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    if (clientVersion !== undefined) {
      const conflict = await checkVersionConflict(
        prisma.story,
        id,
        clientVersion,
        { onBudget: true, version: { increment: 1 } },
        "story"
      );
      if (conflict) return conflict;
      const full = await prisma.story.findUnique({ where: { id }, include: storyInclude });
      return NextResponse.json(full);
    }

    const updated = await prisma.story.update({
      where: { id },
      data: { onBudget: true, version: { increment: 1 } },
      include: storyInclude,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("POST /api/stories/[id]/publish error:", error);
    return NextResponse.json({ error: "Failed to publish story" }, { status: 500 });
  }
}

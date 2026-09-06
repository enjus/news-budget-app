import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkWriteLimit, blockedFromDraft } from "@/lib/api-helpers";

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
      select: { onBudget: true, createdByUserId: true, assignments: { select: { personId: true } } },
    });

    if (!story) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    if (story.onBudget) {
      return NextResponse.json({ error: "Story is already on the budget" }, { status: 400 });
    }

    // Only the creator, an assignee, or an admin can publish a draft
    if (blockedFromDraft(story, session.user)) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    if (clientVersion !== undefined) {
      const updated = await prisma.story.updateMany({
        where: { id, version: clientVersion },
        data: { onBudget: true, version: { increment: 1 } },
      });
      if (updated.count === 0) {
        const exists = await prisma.story.findUnique({ where: { id }, select: { id: true, version: true } });
        if (!exists) return NextResponse.json({ error: "Story not found" }, { status: 404 });
        return NextResponse.json(
          { error: "This story was modified by another user. Please reload.", version: exists.version },
          { status: 409 }
        );
      }
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

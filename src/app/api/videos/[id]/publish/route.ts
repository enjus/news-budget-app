import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkWriteLimit, blockedFromDraft } from "@/lib/api-helpers";

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> };

const videoInclude = {
  assignments: { include: { person: true } },
  story: { select: { id: true, slug: true, budgetLine: true } },
  _count: { select: { comments: true } },
} as const;

export async function POST(_request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const limited = checkWriteLimit(session.user.id);
    if (limited) return limited;

    const { id } = await params;

    const video = await prisma.video.findUnique({
      where: { id },
      select: { onBudget: true, createdByUserId: true, assignments: { select: { personId: true } } },
    });

    if (!video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    if (video.onBudget) {
      return NextResponse.json({ error: "Video is already on the budget" }, { status: 400 });
    }

    // Only the creator, an assignee, or an admin can publish a draft
    if (blockedFromDraft(video, session.user)) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    const updated = await prisma.video.update({
      where: { id },
      data: { onBudget: true },
      include: videoInclude,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("POST /api/videos/[id]/publish error:", error);
    return NextResponse.json({ error: "Failed to publish video" }, { status: 500 });
  }
}

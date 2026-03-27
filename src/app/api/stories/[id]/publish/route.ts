import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasAdminAccess } from "@/lib/utils";
import { checkWriteLimit } from "@/lib/api-helpers";

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> };

const storyInclude = {
  assignments: { include: { person: true } },
  visuals: { include: { person: true } },
  videos: true,
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

    const story = await prisma.story.findUnique({
      where: { id },
      select: { onBudget: true, createdByUserId: true },
    });

    if (!story) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    if (story.onBudget) {
      return NextResponse.json({ error: "Story is already on the budget" }, { status: 400 });
    }

    // Only the creator or an admin can publish a draft
    if (story.createdByUserId !== session.user.id && !hasAdminAccess(session.user.appRole)) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    const updated = await prisma.story.update({
      where: { id },
      data: { onBudget: true },
      include: storyInclude,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("POST /api/stories/[id]/publish error:", error);
    return NextResponse.json({ error: "Failed to publish story" }, { status: 500 });
  }
}

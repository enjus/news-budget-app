import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id: storyId } = await params;

    const story = await prisma.story.findUnique({ where: { id: storyId } });
    if (!story) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    const mediaRequests = await prisma.mediaRequest.findMany({
      where: { storyId },
      include: {
        assignments: { include: { person: true } },
        requestedBy: { select: { id: true, name: true } },
        story: { select: { id: true, slug: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(mediaRequests);
  } catch (error) {
    console.error("GET /api/stories/[id]/media-requests error:", error);
    return NextResponse.json({ error: "Failed to fetch media requests" }, { status: 500 });
  }
}

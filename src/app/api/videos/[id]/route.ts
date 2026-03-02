import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateVideoSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

const videoInclude = {
  assignments: { include: { person: true } },
  story: { select: { id: true, slug: true, budgetLine: true } },
} as const;

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;

    const video = await prisma.video.findUnique({
      where: { id },
      include: videoInclude,
    });

    if (!video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    return NextResponse.json(video);
  } catch (error) {
    console.error("GET /api/videos/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch video" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const body = await request.json();
    const result = updateVideoSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", fieldErrors: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { onlinePubDate, storyId, ...rest } = result.data;

    if (storyId) {
      const story = await prisma.story.findUnique({ where: { id: storyId } });
      if (!story) {
        return NextResponse.json({ error: "Story not found" }, { status: 404 });
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = { ...rest };
    if (onlinePubDate !== undefined) {
      data.onlinePubDate = onlinePubDate ? new Date(onlinePubDate) : null;
    }
    if ("storyId" in result.data) {
      data.storyId = storyId ?? null;
    }

    // Track when a video is shelved for the 90-day auto-deletion clock
    if (rest.status === "SHELVED") {
      const existing = await prisma.video.findUnique({ where: { id }, select: { status: true } });
      if (existing && existing.status !== "SHELVED") {
        data.shelvedAt = new Date();
      }
    } else if (rest.status !== undefined) {
      data.shelvedAt = null;
    }

    const video = await prisma.video.update({
      where: { id },
      data,
      include: videoInclude,
    });

    return NextResponse.json(video);
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }
    if (error?.code === "P2002") {
      return NextResponse.json({ error: "A video with that slug already exists" }, { status: 409 });
    }
    console.error("PATCH /api/videos/[id] error:", error);
    return NextResponse.json({ error: "Failed to update video" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;

    await prisma.video.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }
    console.error("DELETE /api/videos/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete video" }, { status: 500 });
  }
}

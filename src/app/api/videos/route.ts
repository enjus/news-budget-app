import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createVideoSchema } from "@/lib/validations";

export const dynamic = 'force-dynamic'

const videoInclude = {
  assignments: { include: { person: true } },
  story: { select: { id: true, slug: true, budgetLine: true } },
} as const;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const storyId = searchParams.get("storyId");
    const standalone = searchParams.get("standalone");
    const enterprise = searchParams.get("enterprise");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (status) {
      where.status = status;

      // Auto-delete videos shelved for more than 90 days
      if (status === "SHELVED") {
        const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        await prisma.video.deleteMany({
          where: { status: "SHELVED", shelvedAt: { lte: cutoff } },
        });
      }
    } else {
      where.status = { not: "SHELVED" };
    }

    if (storyId) {
      where.storyId = storyId;
    } else if (standalone === "true") {
      where.storyId = null;
    }

    if (enterprise === "true") {
      where.isEnterprise = true;
    }

    const videos = await prisma.video.findMany({
      where,
      include: videoInclude,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json(videos);
  } catch (error) {
    console.error("GET /api/videos error:", error);
    return NextResponse.json({ error: "Failed to fetch videos" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = createVideoSchema.safeParse(body);

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

    const video = await prisma.video.create({
      data: {
        ...rest,
        storyId: storyId ?? null,
        onlinePubDate: onlinePubDate ? new Date(onlinePubDate) : null,
      },
      include: videoInclude,
    });

    return NextResponse.json(video, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return NextResponse.json({ error: "A video with that slug already exists" }, { status: 409 });
    }
    console.error("POST /api/videos error:", error);
    return NextResponse.json({ error: "Failed to create video" }, { status: 500 });
  }
}

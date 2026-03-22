import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createVideoSchema } from "@/lib/validations";
import { canCreateContent } from "@/lib/utils";

export const dynamic = 'force-dynamic'

let lastShelvedPurge = 0
const PURGE_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

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

      // Fire-and-forget purge of videos shelved >90 days, rate-limited to once/hour
      if (status === "SHELVED" && Date.now() - lastShelvedPurge > PURGE_INTERVAL_MS) {
        lastShelvedPurge = Date.now()
        const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        prisma.video.deleteMany({
          where: { status: "SHELVED", shelvedAt: { lte: cutoff } },
        }).catch((err) => console.error("Shelved video purge error:", err));
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
    const session = await getServerSession(authOptions);
    if (!session?.user || !canCreateContent(session.user.appRole)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

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

    // If TBD is false but no date provided, revert to TBD
    const onlineTBD = rest.onlinePubDateTBD || !onlinePubDate;

    const video = await prisma.video.create({
      data: {
        ...rest,
        storyId: storyId ?? null,
        onlinePubDateTBD: onlineTBD,
        onlinePubDate: onlineTBD ? null : new Date(onlinePubDate!),
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

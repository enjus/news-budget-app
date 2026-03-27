import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createVideoSchema } from "@/lib/validations";
import { canCreateContent } from "@/lib/utils";
import { checkWriteLimit } from "@/lib/api-helpers";

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
    const where: any = { onBudget: true };

    if (status) {
      where.status = status;
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

    const take = Math.min(parseInt(searchParams.get("take") ?? "100", 10) || 100, 200);
    const skip = parseInt(searchParams.get("skip") ?? "0", 10) || 0;

    const videos = await prisma.video.findMany({
      where,
      include: videoInclude,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      take,
      skip,
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

    const limited = checkWriteLimit(session.user.id);
    if (limited) return limited;

    const body = await request.json();
    const result = createVideoSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", fieldErrors: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { onlinePubDate, storyId, onBudget, ...rest } = result.data;

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
        onBudget: onBudget ?? true,
        createdByUserId: session.user.id,
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

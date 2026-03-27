import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic'

const personSelect = { select: { id: true, name: true, defaultRole: true } } as const;

const storyInclude = {
  assignments: { include: { person: personSelect } },
  visuals: { select: { id: true, type: true, person: { select: { name: true } } } },
  videos: { select: { id: true } },
} as const;

const videoInclude = {
  assignments: { include: { person: personSelect } },
  story: { select: { id: true, slug: true, budgetLine: true } },
} as const;

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const [stories, videos] = await Promise.all([
      prisma.story.findMany({
        where: { createdByUserId: session.user.id, onBudget: false },
        include: storyInclude,
        orderBy: { createdAt: "desc" },
      }),
      prisma.video.findMany({
        where: { createdByUserId: session.user.id, onBudget: false },
        include: videoInclude,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return NextResponse.json({ stories, videos });
  } catch (error) {
    console.error("GET /api/drafts error:", error);
    return NextResponse.json({ error: "Failed to fetch drafts" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { VIDEOS_ENABLED } from "@/lib/features";

export const dynamic = 'force-dynamic'

const personSelect = { select: { id: true, name: true, defaultRole: true } } as const;

const storyInclude = {
  assignments: { include: { person: personSelect } },
  visuals: { select: { id: true, type: true, person: { select: { name: true } } } },
  videos: { select: { id: true } },
  tags: true,
  _count: { select: { comments: true } },
} as const;

const videoInclude = {
  assignments: { include: { person: personSelect } },
  story: { select: { id: true, slug: true, budgetLine: true } },
  _count: { select: { comments: true } },
} as const;

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // "Your drafts" includes drafts you created and drafts you're assigned to —
    // matches the visibility grant in blockedFromDraft() (src/lib/api-helpers.ts).
    const { personId } = session.user;
    const ownerOrAssignee = {
      OR: [
        { createdByUserId: session.user.id },
        ...(personId ? [{ assignments: { some: { personId } } }] : []),
      ],
    };

    const [stories, videos] = await Promise.all([
      prisma.story.findMany({
        // pitchedAt: null excludes pitches — they get their own "My pitches"
        // section on /me, where the "private to you" framing here would be wrong.
        where: { onBudget: false, pitchedAt: null, ...ownerOrAssignee },
        include: storyInclude,
        orderBy: { createdAt: "desc" },
      }),
      VIDEOS_ENABLED
        ? prisma.video.findMany({
            where: { onBudget: false, ...ownerOrAssignee },
            include: videoInclude,
            orderBy: { createdAt: "desc" },
          })
        : Promise.resolve([]),
    ]);

    return NextResponse.json({ stories, videos });
  } catch (error) {
    console.error("GET /api/drafts error:", error);
    return NextResponse.json({ error: "Failed to fetch drafts" }, { status: 500 });
  }
}

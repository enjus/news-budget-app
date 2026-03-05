import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> };

export interface PersonContentItem {
  type: "story" | "video";
  id: string;
  slug: string;
  budgetLine: string;
  status: string;
  onlinePubDate: string | null;
  onlinePubDateTBD: boolean;
  role: string;
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;

    const person = await prisma.person.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, defaultRole: true },
    });

    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    const [storyAssignments, videoAssignments] = await Promise.all([
      prisma.storyAssignment.findMany({
        where: {
          personId: id,
          story: { status: { not: "SHELVED" } },
        },
        include: {
          story: {
            select: {
              id: true,
              slug: true,
              budgetLine: true,
              status: true,
              onlinePubDate: true,
              onlinePubDateTBD: true,
            },
          },
        },
      }),

      prisma.videoAssignment.findMany({
        where: {
          personId: id,
          video: { status: { not: "SHELVED" } },
        },
        include: {
          video: {
            select: {
              id: true,
              slug: true,
              budgetLine: true,
              status: true,
              onlinePubDate: true,
              onlinePubDateTBD: true,
            },
          },
        },
      }),
    ]);

    const items: PersonContentItem[] = [
      ...storyAssignments.map((a) => ({
        type: "story" as const,
        id: a.story.id,
        slug: a.story.slug,
        budgetLine: a.story.budgetLine,
        status: a.story.status,
        onlinePubDate: a.story.onlinePubDate?.toISOString() ?? null,
        onlinePubDateTBD: a.story.onlinePubDateTBD,
        role: a.role,
      })),
      ...videoAssignments.map((a) => ({
        type: "video" as const,
        id: a.video.id,
        slug: a.video.slug,
        budgetLine: a.video.budgetLine,
        status: a.video.status,
        onlinePubDate: a.video.onlinePubDate?.toISOString() ?? null,
        onlinePubDateTBD: a.video.onlinePubDateTBD,
        role: a.role,
      })),
    ];

    // TBD first (alpha by slug), then reverse chronological
    items.sort((a, b) => {
      if (a.onlinePubDateTBD && b.onlinePubDateTBD) return a.slug.localeCompare(b.slug);
      if (a.onlinePubDateTBD) return -1;
      if (b.onlinePubDateTBD) return 1;
      return new Date(b.onlinePubDate!).getTime() - new Date(a.onlinePubDate!).getTime();
    });

    return NextResponse.json({ person, items });
  } catch (error) {
    console.error("GET /api/people/[id]/content error:", error);
    return NextResponse.json({ error: "Failed to fetch person content" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { EditionDateGroup, StoryListItem } from "@/types";

export const dynamic = 'force-dynamic'

const personSelect = { select: { id: true, name: true, defaultRole: true } } as const;

const storyInclude = {
  assignments: { include: { person: personSelect } },
  visuals: { select: { id: true, type: true, person: { select: { name: true } } } },
  videos: { select: { id: true } },
  tags: true,
  _count: { select: { comments: true } },
} as const;

function localDateStr(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function GET() {
  try {
    const now = new Date();
    const windowStart = new Date(now);
    windowStart.setDate(now.getDate() - 90);

    const datedStories = (await prisma.story.findMany({
      where: {
        onBudget: true,
        status: { not: "SHELVED" },
        printPubDateTBD: false,
        printPubDate: { gte: windowStart },
      },
      include: storyInclude,
      orderBy: [{ printPubDate: "asc" }, { createdAt: "asc" }],
    })) as unknown as StoryListItem[];

    const groupMap = new Map<string, EditionDateGroup>();

    const getOrCreate = (dateKey: string): EditionDateGroup => {
      if (!groupMap.has(dateKey)) {
        groupMap.set(dateKey, { date: dateKey, stories: [] });
      }
      return groupMap.get(dateKey)!;
    };

    for (const story of datedStories) {
      getOrCreate(localDateStr(new Date(story.printPubDate!))).stories.push(story);
    }

    const groups = Array.from(groupMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({ groups });
  } catch (error) {
    console.error("GET /api/budget/edition error:", error);
    return NextResponse.json({ error: "Failed to fetch edition budget" }, { status: 500 });
  }
}

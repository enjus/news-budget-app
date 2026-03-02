import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { EditionDateGroup, StoryWithRelations } from "@/types";

const storyInclude = {
  assignments: { include: { person: true } },
  visuals: { include: { person: true } },
  videos: true,
} as const;

function localDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function GET() {
  try {
    const stories = await prisma.story.findMany({
      where: { status: { not: "SHELVED" } },
      include: storyInclude,
      orderBy: [{ printPubDate: "asc" }, { createdAt: "asc" }],
    }) as unknown as StoryWithRelations[];

    const groupMap = new Map<string, EditionDateGroup>();

    const getOrCreate = (dateKey: string): EditionDateGroup => {
      if (!groupMap.has(dateKey)) {
        groupMap.set(dateKey, { date: dateKey, stories: [] });
      }
      return groupMap.get(dateKey)!;
    };

    for (const story of stories) {
      const tbd = (story as unknown as { printPubDateTBD: boolean }).printPubDateTBD ?? true;
      const date = (story as unknown as { printPubDate: Date | null }).printPubDate ?? null;

      if (tbd || !date) {
        getOrCreate("TBD").stories.push(story);
      } else {
        getOrCreate(localDateStr(date)).stories.push(story);
      }
    }

    const groups = Array.from(groupMap.values()).sort((a, b) => {
      if (a.date === "TBD" && b.date === "TBD") return 0;
      if (a.date === "TBD") return 1;
      if (b.date === "TBD") return -1;
      return a.date.localeCompare(b.date);
    });

    return NextResponse.json({ groups });
  } catch (error) {
    console.error("GET /api/budget/edition error:", error);
    return NextResponse.json({ error: "Failed to fetch edition budget" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { EnterpriseDateGroup, StoryWithRelations, VideoWithRelations } from "@/types";

const storyInclude = {
  assignments: { include: { person: true } },
  visuals: { include: { person: true } },
  videos: true,
} as const;

const videoInclude = {
  assignments: { include: { person: true } },
  story: { select: { id: true, slug: true, budgetLine: true } },
} as const;

/**
 * Derive the date bucket key for an enterprise item.
 * - If both onlinePubDateTBD and printPubDateTBD are true → "TBD"
 * - Otherwise use the earliest non-TBD date (prefer onlinePubDate, fall back to printPubDate)
 */
function getDateBucket(
  onlinePubDateTBD: boolean,
  printPubDateTBD: boolean,
  onlinePubDate: Date | null,
  printPubDate: Date | null
): string {
  if (onlinePubDateTBD && printPubDateTBD) return "TBD";

  const candidates: Date[] = [];
  if (!onlinePubDateTBD && onlinePubDate) candidates.push(onlinePubDate);
  if (!printPubDateTBD && printPubDate) candidates.push(printPubDate);

  if (candidates.length === 0) return "TBD";

  // Prefer the earliest date
  candidates.sort((a, b) => a.getTime() - b.getTime());
  const earliest = candidates[0];

  // Format as YYYY-MM-DD in UTC
  const year = earliest.getUTCFullYear();
  const month = String(earliest.getUTCMonth() + 1).padStart(2, "0");
  const day = String(earliest.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function GET() {
  try {
    const [stories, videos] = await Promise.all([
      prisma.story.findMany({
        where: {
          isEnterprise: true,
          status: { not: "SHELVED" },
        },
        include: storyInclude,
        orderBy: [{ onlinePubDate: "asc" }, { printPubDate: "asc" }, { createdAt: "asc" }],
      }) as Promise<StoryWithRelations[]>,

      prisma.video.findMany({
        where: {
          isEnterprise: true,
          status: { not: "SHELVED" },
        },
        include: videoInclude,
        orderBy: [{ onlinePubDate: "asc" }, { createdAt: "asc" }],
      }) as Promise<VideoWithRelations[]>,
    ]);

    // Build group map
    const groupMap = new Map<string, EnterpriseDateGroup>();

    const getOrCreateGroup = (dateKey: string): EnterpriseDateGroup => {
      if (!groupMap.has(dateKey)) {
        groupMap.set(dateKey, { date: dateKey, stories: [], videos: [] });
      }
      return groupMap.get(dateKey)!;
    };

    for (const story of stories) {
      // Stories have both printPubDate fields; videos only have online fields
      const printPubDateTBD = (story as unknown as { printPubDateTBD: boolean }).printPubDateTBD ?? true;
      const printPubDate = (story as unknown as { printPubDate: Date | null }).printPubDate ?? null;

      const bucket = getDateBucket(
        story.onlinePubDateTBD,
        printPubDateTBD,
        story.onlinePubDate,
        printPubDate
      );
      getOrCreateGroup(bucket).stories.push(story);
    }

    for (const video of videos) {
      // Videos don't have printPubDate — treat printPubDateTBD as true
      const bucket = getDateBucket(video.onlinePubDateTBD, true, video.onlinePubDate, null);
      getOrCreateGroup(bucket).videos.push(video);
    }

    // Sort groups: dated buckets ascending, TBD last
    const groups = Array.from(groupMap.values()).sort((a, b) => {
      if (a.date === "TBD" && b.date === "TBD") return 0;
      if (a.date === "TBD") return 1;
      if (b.date === "TBD") return -1;
      return a.date.localeCompare(b.date);
    });

    return NextResponse.json({ groups });
  } catch (error) {
    console.error("GET /api/budget/enterprise error:", error);
    return NextResponse.json({ error: "Failed to fetch enterprise budget" }, { status: 500 });
  }
}

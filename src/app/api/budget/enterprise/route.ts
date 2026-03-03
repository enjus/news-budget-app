import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { EnterpriseDateGroup, EnterpriseStoryItem, VideoWithRelations } from "@/types";

export const dynamic = 'force-dynamic'

const storyInclude = {
  assignments: { include: { person: true } },
  visuals: { select: { id: true, type: true } },
  videos: { select: { id: true } },
} as const;

const videoInclude = {
  assignments: { include: { person: true } },
  story: { select: { id: true, slug: true, budgetLine: true } },
} as const;

const TBD_CAP = 500;

/**
 * Return the Monday of the week containing `date` as a YYYY-MM-DD string.
 * Weeks are Monday–Sunday.
 */
function getMondayOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const dayStr = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${dayStr}`;
}

/**
 * Derive the week bucket key for an enterprise item.
 * - If both onlinePubDateTBD and printPubDateTBD are true → "TBD"
 * - Otherwise use the Monday of the week containing the earliest non-TBD date
 */
function getDateBucket(story: EnterpriseStoryItem): string {
  if (story.onlinePubDateTBD && story.printPubDateTBD) return "TBD";

  const candidates: Date[] = [];
  if (!story.onlinePubDateTBD && story.onlinePubDate) candidates.push(new Date(story.onlinePubDate));
  if (!story.printPubDateTBD && story.printPubDate) candidates.push(new Date(story.printPubDate));

  if (candidates.length === 0) return "TBD";

  candidates.sort((a, b) => a.getTime() - b.getTime());
  return getMondayOfWeek(candidates[0]);
}

export async function GET() {
  try {
    const now = new Date();
    // Include dated enterprise items from the past 90 days forward — enough
    // to surface recently-published pieces while bounding the query.
    const windowStart = new Date(now);
    windowStart.setDate(now.getDate() - 90);

    const [datedStories, tbdStories, datedVideos, tbdVideos] = await Promise.all([
      // Dated: at least one of online/print pub date falls within the window
      prisma.story.findMany({
        where: {
          isEnterprise: true,
          status: { not: "SHELVED" },
          OR: [
            { onlinePubDateTBD: false, onlinePubDate: { gte: windowStart } },
            { printPubDateTBD: false, printPubDate: { gte: windowStart } },
          ],
        },
        include: storyInclude,
        orderBy: [{ onlinePubDate: "asc" }, { printPubDate: "asc" }, { createdAt: "asc" }],
      }) as unknown as EnterpriseStoryItem[],

      // TBD: both dates unset, capped to prevent unbounded growth
      prisma.story.findMany({
        where: {
          isEnterprise: true,
          status: { not: "SHELVED" },
          onlinePubDateTBD: true,
          printPubDateTBD: true,
        },
        include: storyInclude,
        orderBy: { createdAt: "desc" },
        take: TBD_CAP,
      }) as unknown as EnterpriseStoryItem[],

      prisma.video.findMany({
        where: {
          isEnterprise: true,
          status: { not: "SHELVED" },
          onlinePubDateTBD: false,
          onlinePubDate: { gte: windowStart },
        },
        include: videoInclude,
        orderBy: [{ onlinePubDate: "asc" }, { createdAt: "asc" }],
      }) as unknown as VideoWithRelations[],

      prisma.video.findMany({
        where: {
          isEnterprise: true,
          status: { not: "SHELVED" },
          onlinePubDateTBD: true,
        },
        include: videoInclude,
        orderBy: { createdAt: "desc" },
        take: TBD_CAP,
      }) as unknown as VideoWithRelations[],
    ]);

    // Build group map
    const groupMap = new Map<string, EnterpriseDateGroup>();

    const getOrCreateGroup = (dateKey: string): EnterpriseDateGroup => {
      if (!groupMap.has(dateKey)) {
        groupMap.set(dateKey, { date: dateKey, stories: [], videos: [] });
      }
      return groupMap.get(dateKey)!;
    };

    for (const story of datedStories) {
      getOrCreateGroup(getDateBucket(story)).stories.push(story);
    }
    for (const story of tbdStories) {
      getOrCreateGroup("TBD").stories.push(story);
    }

    for (const video of datedVideos) {
      const bucket = !video.onlinePubDateTBD && video.onlinePubDate
        ? getMondayOfWeek(new Date(video.onlinePubDate))
        : "TBD";
      getOrCreateGroup(bucket).videos.push(video);
    }
    for (const video of tbdVideos) {
      getOrCreateGroup("TBD").videos.push(video);
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

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TIME_BUCKETS, dateToBucket } from "@/lib/utils";
import type { DailyBudgetSlot, StoryListItem, VideoWithRelations } from "@/types";

export const dynamic = 'force-dynamic'

// Lighter include for budget list views — no visuals.person, no videos relation.
const storyInclude = {
  assignments: { include: { person: true } },
  visuals: { select: { id: true, type: true } },
} as const;

const videoInclude = {
  assignments: { include: { person: true } },
  story: { select: { id: true, slug: true, budgetLine: true } },
} as const;

// Safety cap on TBD items. Editors naturally shelve/delete excess stories;
// this only kicks in if TBD accumulation would start degrading performance.
const TBD_CAP = 500;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");

    if (!date) {
      return NextResponse.json({ error: "Query param date (YYYY-MM-DD) is required" }, { status: 400 });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "date must be in YYYY-MM-DD format" }, { status: 400 });
    }

    // Pub times are stored as newsroom-time-as-UTC, so query boundaries use UTC midnight.
    const dayStart = new Date(`${date}T00:00:00Z`);
    const dayEnd = new Date(`${date}T23:59:59.999Z`);

    // Split dated and TBD queries so the TBD cap can be applied independently.
    // A combined OR query cannot efficiently cap only the TBD branch.
    const [datedStories, tbdStories, datedVideos, tbdVideos] = await Promise.all([
      prisma.story.findMany({
        where: {
          status: { not: "SHELVED" },
          onlinePubDateTBD: false,
          onlinePubDate: { gte: dayStart, lte: dayEnd },
        },
        include: storyInclude,
        orderBy: [{ sortOrder: "asc" }, { onlinePubDate: "asc" }],
      }) as unknown as StoryListItem[],

      prisma.story.findMany({
        where: { status: { not: "SHELVED" }, onlinePubDateTBD: true, isEnterprise: false },
        include: storyInclude,
        orderBy: { createdAt: "desc" },
        take: TBD_CAP,
      }) as unknown as StoryListItem[],

      prisma.video.findMany({
        where: {
          status: { not: "SHELVED" },
          onlinePubDateTBD: false,
          onlinePubDate: { gte: dayStart, lte: dayEnd },
        },
        include: videoInclude,
        orderBy: [{ sortOrder: "asc" }, { onlinePubDate: "asc" }],
      }) as unknown as VideoWithRelations[],

      prisma.video.findMany({
        where: { status: { not: "SHELVED" }, onlinePubDateTBD: true, isEnterprise: false },
        include: videoInclude,
        orderBy: { createdAt: "desc" },
        take: TBD_CAP,
      }) as unknown as VideoWithRelations[],
    ]);

    const stories = [...datedStories, ...tbdStories];
    const videos = [...datedVideos, ...tbdVideos];

    // Initialise all 5 buckets (always return all of them, including empty ones)
    const bucketMap = new Map<string, DailyBudgetSlot>();
    for (const bucket of TIME_BUCKETS) {
      bucketMap.set(bucket.id, { slot: bucket.id, stories: [], videos: [] });
    }

    for (const story of stories) {
      const bucketId =
        story.onlinePubDateTBD || !story.onlinePubDate
          ? "TBD"
          : dateToBucket(new Date(story.onlinePubDate));
      const bucket = bucketMap.get(bucketId) ?? bucketMap.get("TBD")!;
      bucket.stories.push(story);
    }

    for (const video of videos) {
      const bucketId =
        video.onlinePubDateTBD || !video.onlinePubDate
          ? "TBD"
          : dateToBucket(new Date(video.onlinePubDate));
      const bucket = bucketMap.get(bucketId) ?? bucketMap.get("TBD")!;
      bucket.videos.push(video);
    }

    // Sort within each bucket by onlinePubDate ascending (TBD items last)
    for (const slot of bucketMap.values()) {
      slot.stories.sort((a, b) => {
        if (!a.onlinePubDate) return 1;
        if (!b.onlinePubDate) return -1;
        return new Date(a.onlinePubDate).getTime() - new Date(b.onlinePubDate).getTime();
      });
      slot.videos.sort((a, b) => {
        if (!a.onlinePubDate) return 1;
        if (!b.onlinePubDate) return -1;
        return new Date(a.onlinePubDate).getTime() - new Date(b.onlinePubDate).getTime();
      });
    }

    // Return all buckets in definition order
    const slots = TIME_BUCKETS.map((b) => bucketMap.get(b.id)!);

    return NextResponse.json({ date, slots });
  } catch (error) {
    console.error("GET /api/budget/daily error:", error);
    return NextResponse.json({ error: "Failed to fetch daily budget" }, { status: 500 });
  }
}

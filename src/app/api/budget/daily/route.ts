import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TIME_BUCKETS, dateToBucket } from "@/lib/utils";
import type { DailyBudgetSlot, StoryWithRelations, VideoWithRelations } from "@/types";

const storyInclude = {
  assignments: { include: { person: true } },
  visuals: { include: { person: true } },
  videos: true,
} as const;

const videoInclude = {
  assignments: { include: { person: true } },
  story: { select: { id: true, slug: true, budgetLine: true } },
} as const;

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

    // Use local midnight so bucket times stay consistent with the user's clock
    const dayStart = new Date(`${date}T00:00:00`);
    const dayEnd = new Date(`${date}T23:59:59.999`);

    const [stories, videos] = await Promise.all([
      prisma.story.findMany({
        where: {
          status: { not: "SHELVED" },
          OR: [
            // Stories with a scheduled online pub date on this day
            { onlinePubDateTBD: false, onlinePubDate: { gte: dayStart, lte: dayEnd } },
            // TBD stories persist on every day's budget until shelved or assigned a time
            { onlinePubDateTBD: true },
          ],
        },
        include: storyInclude,
        orderBy: [{ sortOrder: "asc" }, { onlinePubDate: "asc" }],
      }) as unknown as StoryWithRelations[],

      prisma.video.findMany({
        where: {
          status: { not: "SHELVED" },
          OR: [
            { onlinePubDateTBD: false, onlinePubDate: { gte: dayStart, lte: dayEnd } },
            { onlinePubDateTBD: true },
          ],
        },
        include: videoInclude,
        orderBy: [{ sortOrder: "asc" }, { onlinePubDate: "asc" }],
      }) as unknown as VideoWithRelations[],
    ]);

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
        if (!a.onlinePubDate) return 1
        if (!b.onlinePubDate) return -1
        return new Date(a.onlinePubDate).getTime() - new Date(b.onlinePubDate).getTime()
      })
      slot.videos.sort((a, b) => {
        if (!a.onlinePubDate) return 1
        if (!b.onlinePubDate) return -1
        return new Date(a.onlinePubDate).getTime() - new Date(b.onlinePubDate).getTime()
      })
    }

    // Return all buckets in definition order
    const slots = TIME_BUCKETS.map((b) => bucketMap.get(b.id)!);

    return NextResponse.json({ date, slots });
  } catch (error) {
    console.error("GET /api/budget/daily error:", error);
    return NextResponse.json({ error: "Failed to fetch daily budget" }, { status: 500 });
  }
}

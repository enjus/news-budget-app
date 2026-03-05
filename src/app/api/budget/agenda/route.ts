import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addDays } from "date-fns";
import type { StoryListItem, VideoWithRelations } from "@/types";

export const dynamic = 'force-dynamic'

const storyInclude = {
  assignments: { include: { person: true } },
  visuals: { select: { id: true, type: true } },
} as const;

const videoInclude = {
  assignments: { include: { person: true } },
  story: { select: { id: true, slug: true, budgetLine: true } },
} as const;

const TBD_CAP = 500;

export interface AgendaDay {
  date: string; // YYYY-MM-DD or "TBD"
  stories: StoryListItem[];
  videos: VideoWithRelations[];
}

export interface AgendaResponse {
  start: string;
  days: AgendaDay[];
  tbd: AgendaDay;
}

function localDateStr(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start");

    if (!start) {
      return NextResponse.json({ error: "Query param start (YYYY-MM-DD) is required" }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) {
      return NextResponse.json({ error: "start must be in YYYY-MM-DD format" }, { status: 400 });
    }

    const startDate = new Date(`${start}T00:00:00Z`);
    const windowEnd = addDays(startDate, 7);

    const [datedStories, tbdStories, datedVideos, tbdVideos] = await Promise.all([
      prisma.story.findMany({
        where: {
          status: { not: "SHELVED" },
          onlinePubDateTBD: false,
          onlinePubDate: { gte: startDate, lt: windowEnd },
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
          onlinePubDate: { gte: startDate, lt: windowEnd },
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

    // Build the 7-day buckets
    const days: AgendaDay[] = [];
    for (let i = 0; i < 7; i++) {
      days.push({ date: localDateStr(addDays(startDate, i)), stories: [], videos: [] });
    }
    const tbd: AgendaDay = { date: "TBD", stories: [], videos: [] };

    for (const story of datedStories) {
      const dateStr = localDateStr(new Date(story.onlinePubDate!));
      const day = days.find((d) => d.date === dateStr);
      if (day) day.stories.push(story);
    }
    for (const story of tbdStories) {
      tbd.stories.push(story);
    }

    for (const video of datedVideos) {
      const dateStr = localDateStr(new Date(video.onlinePubDate!));
      const day = days.find((d) => d.date === dateStr);
      if (day) day.videos.push(video);
    }
    for (const video of tbdVideos) {
      tbd.videos.push(video);
    }

    // Sort items within each day bucket by onlinePubDate ascending (null at end)
    const byTime = (a: { onlinePubDate: Date | null }, b: { onlinePubDate: Date | null }) => {
      if (!a.onlinePubDate && !b.onlinePubDate) return 0;
      if (!a.onlinePubDate) return 1;
      if (!b.onlinePubDate) return -1;
      return new Date(a.onlinePubDate).getTime() - new Date(b.onlinePubDate).getTime();
    };
    for (const day of days) {
      day.stories.sort(byTime);
      day.videos.sort(byTime);
    }

    return NextResponse.json({ start, days, tbd });
  } catch (error) {
    console.error("GET /api/budget/agenda error:", error);
    return NextResponse.json({ error: "Failed to fetch agenda" }, { status: 500 });
  }
}

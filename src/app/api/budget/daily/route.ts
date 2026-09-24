import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TIME_BUCKETS, dateToBucket, compareAgendaOrder } from "@/lib/utils";
import { parsePersonIds, personAssignmentFilter, parseExcludeReporterIds, reporterTeamExclusionFilter } from "@/lib/budget-query";
import type { DailyBudgetSlot, StoryListItem, VideoWithRelations } from "@/types";

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

// Safety cap on TBD items. Editors naturally shelve/delete excess stories;
// this only kicks in if TBD accumulation would start degrading performance.
const TBD_CAP = 500;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    const personIds = parsePersonIds(searchParams);
    const excludeReporterIds = parseExcludeReporterIds(searchParams);

    if (!date) {
      return NextResponse.json({ error: "Query param date (YYYY-MM-DD) is required" }, { status: 400 });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "date must be in YYYY-MM-DD format" }, { status: 400 });
    }

    // Pub times are stored as newsroom-time-as-UTC, so query boundaries use UTC midnight.
    const dayStart = new Date(`${date}T00:00:00Z`);
    const dayEnd = new Date(`${date}T23:59:59.999Z`);

    // Optional scoping to a set of assigned people (used by the team-filtered budget views).
    const assignmentFilter = personAssignmentFilter(personIds);
    // Optional "hide reporter team" filter (Daily view toolbar control).
    const exclusionFilter = reporterTeamExclusionFilter(excludeReporterIds);

    // Split dated and TBD queries so the TBD cap can be applied independently.
    // A combined OR query cannot efficiently cap only the TBD branch.
    const [datedStories, tbdStories, datedVideos, tbdVideos] = await Promise.all([
      prisma.story.findMany({
        where: {
          onBudget: true,
          status: { not: "SHELVED" },
          onlinePubDateTBD: false,
          onlinePubDate: { gte: dayStart, lte: dayEnd },
          ...assignmentFilter,
          ...exclusionFilter,
        },
        include: storyInclude,
        orderBy: [{ onlinePubDate: "asc" }, { sortOrder: "asc" }],
      }) as unknown as StoryListItem[],

      prisma.story.findMany({
        where: { onBudget: true, status: { not: "SHELVED" }, onlinePubDateTBD: true, isEnterprise: false, ...assignmentFilter, ...exclusionFilter },
        include: storyInclude,
        orderBy: { createdAt: "desc" },
        take: TBD_CAP,
      }) as unknown as StoryListItem[],

      prisma.video.findMany({
        where: {
          onBudget: true,
          status: { not: "SHELVED" },
          onlinePubDateTBD: false,
          onlinePubDate: { gte: dayStart, lte: dayEnd },
          ...assignmentFilter,
          ...exclusionFilter,
        },
        include: videoInclude,
        orderBy: [{ onlinePubDate: "asc" }, { sortOrder: "asc" }],
      }) as unknown as VideoWithRelations[],

      prisma.video.findMany({
        where: { onBudget: true, status: { not: "SHELVED" }, onlinePubDateTBD: true, isEnterprise: false, ...assignmentFilter, ...exclusionFilter },
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

    // Sort within each bucket chronologically, with sortOrder (manual drag
    // order) breaking ties between items sharing an exact pub time. TBD items
    // have no time, so they sort by sortOrder and fall back to the
    // already-fetched createdAt-desc order (Array.sort is stable).
    for (const slot of bucketMap.values()) {
      slot.stories.sort(compareAgendaOrder);
      slot.videos.sort(compareAgendaOrder);
    }

    // Return all buckets in definition order
    const slots = TIME_BUCKETS.map((b) => bucketMap.get(b.id)!);

    return NextResponse.json({ date, slots });
  } catch (error) {
    console.error("GET /api/budget/daily error:", error);
    return NextResponse.json({ error: "Failed to fetch daily budget" }, { status: 500 });
  }
}

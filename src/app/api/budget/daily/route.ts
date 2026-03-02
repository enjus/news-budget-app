import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { DailyBudgetSlot, StoryWithRelations, VideoWithRelations } from "@/types";

const TIME_SLOTS = [
  "TBD",
  "6:00 AM",
  "7:00 AM",
  "8:00 AM",
  "9:00 AM",
  "10:00 AM",
  "11:00 AM",
  "12:00 PM",
  "1:00 PM",
  "2:00 PM",
  "3:00 PM",
  "4:00 PM",
  "5:00 PM",
  "6:00 PM",
  "7:00 PM",
  "8:00 PM",
  "9:00 PM",
  "10:00 PM",
  "11:00 PM",
];

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
 * Derive a TIME_SLOTS value from a Date. Maps to the nearest hour slot.
 * Hours are interpreted in UTC to be consistent with stored datetimes.
 */
function deriveTimeSlot(date: Date): string {
  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes();

  // If before 6 AM, treat as TBD rather than showing no slot
  if (hour < 6) return "TBD";

  // Format to match TIME_SLOTS strings
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  const ampm = hour >= 12 ? "PM" : "AM";
  const slotLabel = `${displayHour}:${minute < 30 ? "00" : "00"} ${ampm}`;

  // Round to the nearest whole hour slot
  const roundedHour = hour;
  const roundedDisplayHour = roundedHour > 12 ? roundedHour - 12 : roundedHour === 0 ? 12 : roundedHour;
  const roundedAmpm = roundedHour >= 12 ? "PM" : "AM";
  const roundedLabel = `${roundedDisplayHour}:00 ${roundedAmpm}`;

  // Suppress unused variable warning
  void slotLabel;

  return TIME_SLOTS.includes(roundedLabel) ? roundedLabel : "TBD";
}

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

    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(`${date}T23:59:59.999Z`);

    // Fetch stories: TBD ones always show, date-specific ones filtered by day
    const [stories, videos] = await Promise.all([
      prisma.story.findMany({
        where: {
          status: { not: "SHELVED" },
          OR: [
            { onlinePubDateTBD: true },
            {
              onlinePubDateTBD: false,
              onlinePubDate: { gte: dayStart, lte: dayEnd },
            },
          ],
        },
        include: storyInclude,
        orderBy: [{ sortOrder: "asc" }, { onlinePubDate: "asc" }],
      }) as Promise<StoryWithRelations[]>,

      prisma.video.findMany({
        where: {
          status: { not: "SHELVED" },
          OR: [
            { onlinePubDateTBD: true },
            {
              onlinePubDateTBD: false,
              onlinePubDate: { gte: dayStart, lte: dayEnd },
            },
          ],
        },
        include: videoInclude,
        orderBy: [{ sortOrder: "asc" }, { onlinePubDate: "asc" }],
      }) as Promise<VideoWithRelations[]>,
    ]);

    // Build slot map
    const slotMap = new Map<string, DailyBudgetSlot>();
    for (const slot of TIME_SLOTS) {
      slotMap.set(slot, { slot, stories: [], videos: [] });
    }

    for (const story of stories) {
      const slot = story.onlinePubDateTBD || !story.onlinePubDate
        ? "TBD"
        : deriveTimeSlot(story.onlinePubDate);
      const bucket = slotMap.get(slot) ?? slotMap.get("TBD")!;
      bucket.stories.push(story);
    }

    for (const video of videos) {
      const slot = video.onlinePubDateTBD || !video.onlinePubDate
        ? "TBD"
        : deriveTimeSlot(video.onlinePubDate);
      const bucket = slotMap.get(slot) ?? slotMap.get("TBD")!;
      bucket.videos.push(video);
    }

    // Only return slots that have content
    const slots = TIME_SLOTS
      .map((slot) => slotMap.get(slot)!)
      .filter((slot) => slot.stories.length > 0 || slot.videos.length > 0);

    return NextResponse.json({ date, slots });
  } catch (error) {
    console.error("GET /api/budget/daily error:", error);
    return NextResponse.json({ error: "Failed to fetch daily budget" }, { status: 500 });
  }
}

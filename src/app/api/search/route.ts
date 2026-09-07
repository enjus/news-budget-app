import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addDays, subDays } from "date-fns";
import { VIDEOS_ENABLED } from "@/lib/features";

export const dynamic = 'force-dynamic'

export interface SearchResult {
  type: "story" | "video";
  id: string;
  slug: string;
  budgetLine: string;
  status: string;
  onlinePubDate: string | null;
  onlinePubDateTBD: boolean;
  /** Absolute days from today, for display; null = TBD */
  daysFromToday: number | null;
  /** True for a pool item (onBudget:false, pitchedAt set) — always false for video results. */
  isPitch: boolean;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const authorId = searchParams.get("authorId") ?? "";

    const today = new Date();
    const windowStart = subDays(today, 90);
    const windowEnd = addDays(today, 90);

    const dateFilter = {
      OR: [
        // Scheduled within the 90-day window
        {
          onlinePubDateTBD: false,
          onlinePubDate: { gte: windowStart, lte: windowEnd },
        },
        // TBD items are always included (they float in the budget)
        { onlinePubDateTBD: true },
      ],
    };

    // Pitches never have pitchText null while a story is off-budget-with-pitchedAt-set, but
    // Video has no pitchText column, so the two text filters diverge (issue #24 §6).
    const storyTextFilter = q
      ? {
          OR: [
            { slug: { contains: q, mode: Prisma.QueryMode.insensitive } },
            { budgetLine: { contains: q, mode: Prisma.QueryMode.insensitive } },
            { pitchText: { contains: q, mode: Prisma.QueryMode.insensitive } },
          ],
        }
      : null;
    const videoTextFilter = q
      ? { OR: [{ slug: { contains: q, mode: Prisma.QueryMode.insensitive } }, { budgetLine: { contains: q, mode: Prisma.QueryMode.insensitive } }] }
      : null;

    const videoWhere = VIDEOS_ENABLED ? {
      onBudget: true,
      status: { not: "SHELVED" },
      AND: videoTextFilter ? [videoTextFilter, dateFilter] : [dateFilter],
      ...(authorId ? { assignments: { some: { personId: authorId } } } : {}),
    } : null;

    const [stories, videos] = await Promise.all([
      prisma.story.findMany({
        where: {
          // A pitch (onBudget:false, pitchedAt set) is included alongside on-budget
          // stories — it's a public pool item, not a private draft.
          OR: [{ onBudget: true }, { pitchedAt: { not: null } }],
          status: { not: "SHELVED" },
          AND: storyTextFilter ? [storyTextFilter, dateFilter] : [dateFilter],
          ...(authorId
            ? { assignments: { some: { personId: authorId } } }
            : {}),
        },
        select: {
          id: true,
          slug: true,
          budgetLine: true,
          status: true,
          onlinePubDate: true,
          onlinePubDateTBD: true,
          onBudget: true,
          pitchedAt: true,
        },
        take: 50,
      }),

      videoWhere
        ? prisma.video.findMany({
            where: videoWhere,
            select: {
              id: true,
              slug: true,
              budgetLine: true,
              status: true,
              onlinePubDate: true,
              onlinePubDateTBD: true,
            },
            take: 50,
          })
        : Promise.resolve([]),
    ]);

    const todayMs = today.getTime();

    function daysFrom(date: Date | null, tbd: boolean): number | null {
      if (tbd || !date) return null;
      return Math.abs(date.getTime() - todayMs) / 86_400_000;
    }

    const results: SearchResult[] = [
      ...stories.map((s) => ({
        type: "story" as const,
        id: s.id,
        slug: s.slug,
        budgetLine: s.budgetLine,
        status: s.status,
        onlinePubDate: s.onlinePubDate ? s.onlinePubDate.toISOString() : null,
        onlinePubDateTBD: s.onlinePubDateTBD,
        daysFromToday: daysFrom(s.onlinePubDate, s.onlinePubDateTBD),
        isPitch: !s.onBudget && s.pitchedAt != null,
      })),
      ...videos.map((v) => ({
        type: "video" as const,
        id: v.id,
        slug: v.slug,
        budgetLine: v.budgetLine,
        status: v.status,
        onlinePubDate: v.onlinePubDate ? v.onlinePubDate.toISOString() : null,
        onlinePubDateTBD: v.onlinePubDateTBD,
        daysFromToday: daysFrom(v.onlinePubDate, v.onlinePubDateTBD),
        isPitch: false,
      })),
    ];

    // Sort: closest to today first; TBD items at the end
    results.sort((a, b) => {
      if (a.daysFromToday === null && b.daysFromToday === null) return 0;
      if (a.daysFromToday === null) return 1;
      if (b.daysFromToday === null) return -1;
      return a.daysFromToday - b.daysFromToday;
    });

    return NextResponse.json({ results: results.slice(0, 40) });
  } catch (error) {
    console.error("GET /api/search error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}

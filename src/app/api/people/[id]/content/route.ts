import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dedupeVisualCredits, todayString } from "@/lib/utils";

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> };

export interface PersonContentItem {
  type: "story" | "video";
  id: string;
  slug: string;
  budgetLine: string;
  status: string;
  onlinePubDate: string | null;
  onlinePubDateTBD: boolean;
  onBudget: boolean;
  role: string;
}

// Safety cap on past items, across stories + visual credits + videos combined.
// Only applied when the caller opts in via `?cap=1` (see GET below).
const PAST_CAP = 10;

// Safety cap on TBD/upcoming items (matches /api/budget/daily, /api/budget/agenda,
// /api/budget/enterprise, /api/budget/edition, and /api/teams/[id]/content).
const TBD_CAP = 500;

function toStoryItem(a: { role: string; story: { id: string; slug: string; budgetLine: string; status: string; onlinePubDate: Date | null; onlinePubDateTBD: boolean; onBudget: boolean } }): PersonContentItem {
  return {
    type: "story",
    id: a.story.id,
    slug: a.story.slug,
    budgetLine: a.story.budgetLine,
    status: a.story.status,
    onlinePubDate: a.story.onlinePubDate?.toISOString() ?? null,
    onlinePubDateTBD: a.story.onlinePubDateTBD,
    onBudget: a.story.onBudget,
    role: a.role,
  };
}

function toVideoItem(a: { role: string; video: { id: string; slug: string; budgetLine: string; status: string; onlinePubDate: Date | null; onlinePubDateTBD: boolean; onBudget: boolean } }): PersonContentItem {
  return {
    type: "video",
    id: a.video.id,
    slug: a.video.slug,
    budgetLine: a.video.budgetLine,
    status: a.video.status,
    onlinePubDate: a.video.onlinePubDate?.toISOString() ?? null,
    onlinePubDateTBD: a.video.onlinePubDateTBD,
    onBudget: a.video.onBudget,
    role: a.role,
  };
}

const storySelect = {
  id: true, slug: true, budgetLine: true, status: true, onlinePubDate: true, onlinePubDateTBD: true, onBudget: true,
} as const;

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const capped = new URL(request.url).searchParams.get("cap") === "1";

    const person = await prisma.person.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        defaultRole: true,
        isActive: true,
        isStaff: true,
        user: { select: { id: true } },
      },
    });

    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    if (!capped) {
      // Default: fully unbounded, exactly as before `cap` existed. /people/[id]
      // relies on this — its Past date-range filter needs the complete history.
      const [storyAssignments, visualCredits, videoAssignments] = await Promise.all([
        prisma.storyAssignment.findMany({
          where: { personId: id, story: { status: { not: "SHELVED" } } },
          include: { story: { select: storySelect } },
        }),
        prisma.visual.findMany({
          where: { personId: id, story: { status: { not: "SHELVED" } } },
          include: { story: { select: storySelect } },
        }),
        prisma.videoAssignment.findMany({
          where: { personId: id, video: { status: { not: "SHELVED" } } },
          include: { video: { select: storySelect } },
        }),
      ]);

      const items: PersonContentItem[] = [
        ...storyAssignments.map(toStoryItem),
        ...dedupeVisualCredits(visualCredits).map((v) => toStoryItem({ role: v.type, story: v.story })),
        ...videoAssignments.map(toVideoItem),
      ];

      // TBD first (alpha by slug), then reverse chronological. A null date
      // counts as TBD here too, matching itemDateStr().
      items.sort((a, b) => {
        const aTbd = a.onlinePubDateTBD || !a.onlinePubDate;
        const bTbd = b.onlinePubDateTBD || !b.onlinePubDate;
        if (aTbd && bTbd) return a.slug.localeCompare(b.slug);
        if (aTbd) return -1;
        if (bTbd) return 1;
        return new Date(b.onlinePubDate!).getTime() - new Date(a.onlinePubDate!).getTime();
      });

      return NextResponse.json({ person, items });
    }

    // Capped mode: split each source into upcoming/TBD vs. past sub-queries and
    // cap each, mirroring /api/teams/[id]/content's per-member convention.
    const todayStart = new Date(`${todayString()}T00:00:00Z`);

    // A row with onlinePubDateTBD:false and onlinePubDate:null shouldn't occur
    // through the API (requirePubDateField enforces the pairing at create/update
    // time) but legacy/out-of-band data can still have it. Treat it as TBD here
    // too, matching itemDateStr()'s `onlinePubDateTBD || !onlinePubDate` — the
    // OR below is what lets it land in the upcoming/TBD query rather than
    // disappearing (it can never match the past query's `onlinePubDate: {lt}`).
    const [storyUpcoming, storyPast, visualUpcoming, visualPast, videoUpcoming, videoPast] = await Promise.all([
      prisma.storyAssignment.findMany({
        where: {
          personId: id,
          story: { status: { not: "SHELVED" }, OR: [{ onlinePubDateTBD: true }, { onlinePubDate: null }, { onlinePubDate: { gte: todayStart } }] },
        },
        include: { story: { select: storySelect } },
        take: TBD_CAP,
      }),
      prisma.storyAssignment.findMany({
        where: {
          personId: id,
          story: { status: { not: "SHELVED" }, onlinePubDateTBD: false, onlinePubDate: { lt: todayStart } },
        },
        include: { story: { select: storySelect } },
        orderBy: { story: { onlinePubDate: "desc" } },
        // Fetch one extra so we can tell whether the combined past list is truncated.
        take: PAST_CAP + 1,
      }),
      prisma.visual.findMany({
        where: {
          personId: id,
          story: { status: { not: "SHELVED" }, OR: [{ onlinePubDateTBD: true }, { onlinePubDate: null }, { onlinePubDate: { gte: todayStart } }] },
        },
        include: { story: { select: storySelect } },
        // Dedupe distinct (story, type) credits at the DB level before `take`.
        distinct: ["storyId", "type"],
        take: TBD_CAP,
      }),
      prisma.visual.findMany({
        where: {
          personId: id,
          story: { status: { not: "SHELVED" }, onlinePubDateTBD: false, onlinePubDate: { lt: todayStart } },
        },
        include: { story: { select: storySelect } },
        distinct: ["storyId", "type"],
        orderBy: { story: { onlinePubDate: "desc" } },
        take: PAST_CAP + 1,
      }),
      prisma.videoAssignment.findMany({
        where: {
          personId: id,
          video: { status: { not: "SHELVED" }, OR: [{ onlinePubDateTBD: true }, { onlinePubDate: null }, { onlinePubDate: { gte: todayStart } }] },
        },
        include: { video: { select: storySelect } },
        take: TBD_CAP,
      }),
      prisma.videoAssignment.findMany({
        where: {
          personId: id,
          video: { status: { not: "SHELVED" }, onlinePubDateTBD: false, onlinePubDate: { lt: todayStart } },
        },
        include: { video: { select: storySelect } },
        orderBy: { video: { onlinePubDate: "desc" } },
        take: PAST_CAP + 1,
      }),
    ]);

    // visualUpcoming/visualPast are already distinct on (storyId, type) at the
    // DB level (see `distinct` above), so no further JS-level dedupe is needed.
    const upcomingItems: PersonContentItem[] = [
      ...storyUpcoming.map(toStoryItem),
      ...visualUpcoming.map((v) => toStoryItem({ role: v.type, story: v.story })),
      ...videoUpcoming.map(toVideoItem),
    ];

    const mergedPast: PersonContentItem[] = [
      ...storyPast.map(toStoryItem),
      ...visualPast.map((v) => toStoryItem({ role: v.type, story: v.story })),
      ...videoPast.map(toVideoItem),
    ].sort((a, b) => new Date(b.onlinePubDate!).getTime() - new Date(a.onlinePubDate!).getTime());

    const pastTruncated = mergedPast.length > PAST_CAP;
    const pastItems = mergedPast.slice(0, PAST_CAP);

    const items: PersonContentItem[] = [...upcomingItems, ...pastItems];

    // TBD first (alpha by slug), then reverse chronological. A null date counts
    // as TBD here too, matching itemDateStr() — it can only ever appear in
    // `items` via the upcoming/TBD queries above, but treat it defensively.
    items.sort((a, b) => {
      const aTbd = a.onlinePubDateTBD || !a.onlinePubDate;
      const bTbd = b.onlinePubDateTBD || !b.onlinePubDate;
      if (aTbd && bTbd) return a.slug.localeCompare(b.slug);
      if (aTbd) return -1;
      if (bTbd) return 1;
      return new Date(b.onlinePubDate!).getTime() - new Date(a.onlinePubDate!).getTime();
    });

    return NextResponse.json({ person, items, pastTruncated });
  } catch (error) {
    console.error("GET /api/people/[id]/content error:", error);
    return NextResponse.json({ error: "Failed to fetch person content" }, { status: 500 });
  }
}

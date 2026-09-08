import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateStorySchemaBase } from "@/lib/validations";
import { canCreateContent } from "@/lib/utils";
import { checkWriteLimit, requireJSON } from "@/lib/api-helpers";

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> };

const sendToBudgetSchema = updateStorySchemaBase.pick({ slug: true, budgetLine: true }).required();

/** Send to budget — the heavier action r2/r3 originally called "claim" (issue
 *  #24 §4, r6). Rewrites the derived placeholder slug/budgetLine into real
 *  ones and flips onBudget. pitchText is untouched — it persists as
 *  provenance.
 *
 *  Deliberately does NOT require an existing claim, despite §8's original
 *  text. An editor deeming something must-cover and putting it on the budget
 *  before anyone's assigned is not a state this app treats as an error —
 *  it's exactly what the "Unassigned" red chip on StoryCard exists to flag
 *  and make actionable. Gating this on a claim just forced a placeholder
 *  claim-then-unclaim round trip to reach a state the app already supports. */
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !canCreateContent(session.user.appRole)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const limited = checkWriteLimit(session.user.id);
    if (limited) return limited;

    const invalidType = requireJSON(request);
    if (invalidType) return invalidType;

    const { id: storyId } = await params;
    const body = await request.json();
    const result = sendToBudgetSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", fieldErrors: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const story = await prisma.story.findUnique({
      where: { id: storyId },
      select: { onBudget: true, pitchedAt: true },
    });
    if (!story) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }
    if (story.onBudget || story.pitchedAt === null) {
      return NextResponse.json({ error: "Only a pitch can be sent to budget" }, { status: 400 });
    }

    // Scoped on pitchedAt: { not: null } (the same predicate just checked
    // above) so this can't silently clobber a concurrent write — most
    // notably the purge-shelved cron, which can shelve this same pitch
    // between the check above and this write if it's expired and unclaimed.
    // If the cron wins the race, count is 0 and the pitch is now a real
    // SHELVED off-budget item — the caller gets a clean error instead of a
    // send-to-budget update silently landing on top of it.
    const updated = await prisma.story.updateMany({
      where: { id: storyId, pitchedAt: { not: null } },
      data: {
        slug: result.data.slug,
        budgetLine: result.data.budgetLine,
        onBudget: true,
        pitchedAt: null,
        expiresAt: null,
        // A pitch claimed just before its expiresAt can get auto-shelved by
        // the purge-shelved cron while still sitting in the pool (pitchedAt
        // is deliberately kept — see that route's comment). Force it back to
        // DRAFT here so it doesn't go live as a permanently-invisible SHELVED
        // "story"; every pitch is created as DRAFT (see /api/pitches) and
        // nothing else can change a pool item's status.
        status: "DRAFT",
        shelvedAt: null,
        version: { increment: 1 },
      },
    });

    if (updated.count === 0) {
      return NextResponse.json(
        { error: "This pitch was just shelved (expired) and can no longer be sent to budget. Unshelve it first." },
        { status: 409 }
      );
    }

    const full = await prisma.story.findUnique({
      where: { id: storyId },
      include: { assignments: { include: { person: true } } },
    });

    return NextResponse.json(full);
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }
    console.error("POST /api/stories/[id]/send-to-budget error:", error);
    return NextResponse.json({ error: "Failed to send pitch to budget" }, { status: 500 });
  }
}

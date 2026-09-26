import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { checkReadLimit } from "@/lib/api-helpers"
import { addDays, todayString } from "@/lib/utils"
import { ensureDefaultTags } from "@/lib/tags-server"

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ key: string }> }

// Same shape as /api/budget/daily so the tag view can render StoryCard.
const personSelect = { select: { id: true, name: true, defaultRole: true } } as const
const storyInclude = {
  assignments: { include: { person: personSelect } },
  visuals: { select: { id: true, type: true, person: { select: { name: true } } } },
  videos: { select: { id: true } },
  tags: true,
  _count: { select: { comments: true } },
} as const

// "Recent past" window for the tag view, in days before today.
const TAG_PAST_DAYS = 30

// Matches the other budget routes' safety cap.
const TBD_CAP = 500

/**
 * Budgeted stories carrying a tag: TBD, upcoming, and the last TAG_PAST_DAYS
 * days. Off-budget drafts and pitches (onBudget: false) and shelved stories are
 * excluded. Archived tags still resolve so their history stays browsable.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const limited = checkReadLimit(session.user.id)
  if (limited) return limited

  try {
    const { key } = await params
    await ensureDefaultTags()
    const tag = await prisma.tag.findUnique({ where: { key } })
    if (!tag) {
      return NextResponse.json({ error: "Tag not found" }, { status: 404 })
    }

    // Pub dates are newsroom time encoded as UTC, so the cutoff is the
    // newsroom-calendar date at UTC midnight — not Date arithmetic on now().
    const cutoff = new Date(`${addDays(todayString(), -TAG_PAST_DAYS)}T00:00:00.000Z`)

    const stories = await prisma.story.findMany({
      where: {
        onBudget: true,
        status: { not: "SHELVED" },
        tags: { some: { tag: key } },
        OR: [
          { onlinePubDateTBD: true },
          { onlinePubDate: null },
          { onlinePubDate: { gte: cutoff } },
        ],
      },
      include: storyInclude,
      orderBy: { onlinePubDate: "asc" },
      take: TBD_CAP,
    })

    return NextResponse.json({ tag, stories, pastDays: TAG_PAST_DAYS })
  } catch (error) {
    console.error("GET /api/tags/[key]/stories error:", error)
    return NextResponse.json({ error: "Failed to fetch tagged stories" }, { status: 500 })
  }
}

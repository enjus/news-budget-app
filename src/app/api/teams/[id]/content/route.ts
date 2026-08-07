import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { hasAdminAccess, todayString } from "@/lib/utils"
import type { PersonContentItem } from "@/app/api/people/[id]/content/route"

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

// Safety cap on past items per member. TBD and upcoming items stay unbounded
// (matches /api/budget/daily and /api/budget/agenda, which only cap TBD via
// take — history accumulation is the actual performance concern here).
const PAST_CAP = 10

export interface TeamContentResponse {
  team: { id: string; name: string }
  /** Content grouped by person, each with their items */
  memberContent: Array<{
    person: { id: string; name: string; defaultRole: string }
    teamRole: string
    items: PersonContentItem[]
  }>
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { id } = await params

    const team = await prisma.team.findUnique({
      where: { id },
      include: {
        members: {
          include: { person: true },
          orderBy: { role: "asc" },
        },
      },
    })

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 })
    }

    // Non-admin users must be a member of the team to view its content
    if (!hasAdminAccess(session.user.appRole)) {
      const personId = session.user.personId
      const isMember = personId && team.members.some((m) => m.personId === personId)
      if (!isMember) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    // Pub times are stored as newsroom-time-as-UTC (see /api/budget/daily), so
    // "today" uses the same Pacific-time-aware boundary as the rest of the budget views.
    const todayStart = new Date(`${todayString()}T00:00:00Z`)

    // Fetch content for all team members in parallel. Past items are capped
    // (PAST_CAP) since they can accumulate unboundedly; TBD/upcoming items
    // stay unbounded, matching /api/budget/daily and /api/budget/agenda.
    const memberContent = await Promise.all(
      team.members.map(async (member) => {
        const [storyUpcoming, storyPast, videoUpcoming, videoPast] = await Promise.all([
          prisma.storyAssignment.findMany({
            where: {
              personId: member.personId,
              story: {
                onBudget: true,
                status: { not: "SHELVED" },
                OR: [{ onlinePubDateTBD: true }, { onlinePubDate: { gte: todayStart } }],
              },
            },
            include: {
              story: {
                select: {
                  id: true,
                  slug: true,
                  budgetLine: true,
                  status: true,
                  onlinePubDate: true,
                  onlinePubDateTBD: true,
                },
              },
            },
          }),
          prisma.storyAssignment.findMany({
            where: {
              personId: member.personId,
              story: {
                onBudget: true,
                status: { not: "SHELVED" },
                onlinePubDateTBD: false,
                onlinePubDate: { lt: todayStart },
              },
            },
            include: {
              story: {
                select: {
                  id: true,
                  slug: true,
                  budgetLine: true,
                  status: true,
                  onlinePubDate: true,
                  onlinePubDateTBD: true,
                },
              },
            },
            orderBy: { story: { onlinePubDate: "desc" } },
            take: PAST_CAP,
          }),
          prisma.videoAssignment.findMany({
            where: {
              personId: member.personId,
              video: {
                onBudget: true,
                status: { not: "SHELVED" },
                OR: [{ onlinePubDateTBD: true }, { onlinePubDate: { gte: todayStart } }],
              },
            },
            include: {
              video: {
                select: {
                  id: true,
                  slug: true,
                  budgetLine: true,
                  status: true,
                  onlinePubDate: true,
                  onlinePubDateTBD: true,
                },
              },
            },
          }),
          prisma.videoAssignment.findMany({
            where: {
              personId: member.personId,
              video: {
                onBudget: true,
                status: { not: "SHELVED" },
                onlinePubDateTBD: false,
                onlinePubDate: { lt: todayStart },
              },
            },
            include: {
              video: {
                select: {
                  id: true,
                  slug: true,
                  budgetLine: true,
                  status: true,
                  onlinePubDate: true,
                  onlinePubDateTBD: true,
                },
              },
            },
            orderBy: { video: { onlinePubDate: "desc" } },
            take: PAST_CAP,
          }),
        ])

        const storyAssignments = [...storyUpcoming, ...storyPast]
        const videoAssignments = [...videoUpcoming, ...videoPast]

        const items: PersonContentItem[] = [
          ...storyAssignments.map((a) => ({
            type: "story" as const,
            id: a.story.id,
            slug: a.story.slug,
            budgetLine: a.story.budgetLine,
            status: a.story.status,
            onlinePubDate: a.story.onlinePubDate?.toISOString() ?? null,
            onlinePubDateTBD: a.story.onlinePubDateTBD,
            role: a.role,
          })),
          ...videoAssignments.map((a) => ({
            type: "video" as const,
            id: a.video.id,
            slug: a.video.slug,
            budgetLine: a.video.budgetLine,
            status: a.video.status,
            onlinePubDate: a.video.onlinePubDate?.toISOString() ?? null,
            onlinePubDateTBD: a.video.onlinePubDateTBD,
            role: a.role,
          })),
        ]

        // TBD first (alpha), then reverse-chrono
        items.sort((a, b) => {
          if (a.onlinePubDateTBD && b.onlinePubDateTBD) return a.slug.localeCompare(b.slug)
          if (a.onlinePubDateTBD) return -1
          if (b.onlinePubDateTBD) return 1
          return new Date(b.onlinePubDate!).getTime() - new Date(a.onlinePubDate!).getTime()
        })

        return {
          person: {
            id: member.person.id,
            name: member.person.name,
            defaultRole: member.person.defaultRole,
          },
          teamRole: member.role,
          items,
        }
      })
    )

    return NextResponse.json({
      team: { id: team.id, name: team.name },
      memberContent,
    })
  } catch (error) {
    console.error("GET /api/teams/[id]/content error:", error)
    return NextResponse.json({ error: "Failed to fetch team content" }, { status: 500 })
  }
}

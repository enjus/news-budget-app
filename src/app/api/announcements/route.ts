import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { checkReadLimit } from "@/lib/api-helpers"
import { dateOnly, hasAdminAccess, todayString, toDateString } from "@/lib/utils"

export const dynamic = 'force-dynamic'

/** How many days after its last day an announcement stays reachable for admins. */
const RECENTLY_ENDED_DAYS = 3

const select = { id: true, title: true, body: true, url: true, endDate: true, createdAt: true } as const

function serialize(rows: { endDate: Date | null }[]) {
  return rows.map((a) => ({ ...a, endDate: a.endDate ? toDateString(a.endDate) : null }))
}

/**
 * Current homepage announcements, newest first: those with no end date, or
 * an end date of today (Pacific) or later. Admins also get `recentlyEnded` —
 * ones whose last day was within the past 3 days — so a mistaken or
 * just-lapsed announcement can still be extended or deleted from edit mode.
 * Older expired rows aren't returned to anyone. Writes go through
 * /api/admin/announcements.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }
  const limited = checkReadLimit(session.user.id)
  if (limited) return limited

  const today = dateOnly(todayString())
  try {
    const current = await prisma.announcement.findMany({
      where: { OR: [{ endDate: null }, { endDate: { gte: today } }] },
      orderBy: { createdAt: "desc" },
      take: 50,
      select,
    })

    let recentlyEnded: typeof current = []
    if (hasAdminAccess(session.user.appRole)) {
      const windowStart = new Date(today.getTime() - RECENTLY_ENDED_DAYS * 86_400_000)
      recentlyEnded = await prisma.announcement.findMany({
        where: { endDate: { gte: windowStart, lt: today } },
        orderBy: { endDate: "desc" },
        take: 50,
        select,
      })
    }

    return Response.json({ announcements: serialize(current), recentlyEnded: serialize(recentlyEnded) })
  } catch (error) {
    console.error("GET /api/announcements error:", error)
    return Response.json({ error: "Failed to fetch announcements" }, { status: 500 })
  }
}

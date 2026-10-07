import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { checkReadLimit } from "@/lib/api-helpers"
import { dateOnly, todayString, toDateString } from "@/lib/utils"

export const dynamic = 'force-dynamic'

/**
 * Current homepage announcements, newest first: those with no end date, or
 * an end date of today (Pacific) or later. Expired ones simply stop showing.
 * Writes go through /api/admin/announcements.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }
  const limited = checkReadLimit(session.user.id)
  if (limited) return limited

  try {
    const rows = await prisma.announcement.findMany({
      where: { OR: [{ endDate: null }, { endDate: { gte: dateOnly(todayString()) } }] },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, title: true, body: true, url: true, endDate: true, createdAt: true },
    })
    const announcements = rows.map((a) => ({ ...a, endDate: a.endDate ? toDateString(a.endDate) : null }))
    return Response.json({ announcements })
  } catch (error) {
    console.error("GET /api/announcements error:", error)
    return Response.json({ error: "Failed to fetch announcements" }, { status: 500 })
  }
}

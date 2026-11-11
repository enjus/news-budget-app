import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { hasAdminAccess } from "@/lib/utils"

export const dynamic = 'force-dynamic'

/**
 * Lean counterpart to /api/teams/my for the nav, which runs on every page and
 * only needs team names to label the Team tab. Same scoping (admin/Leadership:
 * all teams; others: teams their linked Person belongs to), but no members.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const personId = session.user.personId
  const isAdmin = hasAdminAccess(session.user.appRole)

  if (!isAdmin && !personId) {
    return Response.json({ teams: [] })
  }

  const teams = await prisma.team.findMany({
    where: isAdmin ? undefined : { members: { some: { personId: personId! } } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  })

  return Response.json({ teams })
}

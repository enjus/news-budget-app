import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { hasAdminAccess } from "@/lib/utils"

export const dynamic = 'force-dynamic'

/**
 * Admin/Leadership: returns all teams.
 * Others: returns teams where the current user's linked Person is a member.
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
    include: {
      members: {
        include: { person: true },
        orderBy: { role: "asc" },
      },
    },
    orderBy: { name: "asc" },
  })

  const teamsWithMyRole = teams.map((team) => {
    const myMembership = personId
      ? team.members.find((m) => m.personId === personId)
      : undefined
    return { ...team, myRole: myMembership?.role ?? "MEMBER" }
  })

  return Response.json({ teams: teamsWithMyRole })
}

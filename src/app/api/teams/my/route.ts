import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const dynamic = 'force-dynamic'

/** Returns teams where the current user's linked Person is a member. */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const personId = session.user.personId
  if (!personId) {
    return Response.json({ teams: [] })
  }

  const teams = await prisma.team.findMany({
    where: {
      members: { some: { personId } },
    },
    include: {
      members: {
        include: { person: true },
        orderBy: { role: "asc" },
      },
    },
    orderBy: { name: "asc" },
  })

  // Include the user's role on each team
  const teamsWithMyRole = teams.map((team) => {
    const myMembership = team.members.find((m) => m.personId === personId)
    return { ...team, myRole: myMembership?.role ?? "MEMBER" }
  })

  return Response.json({ teams: teamsWithMyRole })
}

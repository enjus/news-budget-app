import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const dynamic = 'force-dynamic'

/**
 * Lightweight all-teams listing for any authenticated user — distinct from
 * /api/teams/my, which is intentionally membership-scoped for non-admins
 * (TopNav and the /teams page depend on that scoping). This route exists so
 * the Daily view's reporter-team filter can offer every team, not just the
 * signed-in user's own. Team names/membership aren't sensitive; this doesn't
 * touch People-tab access control.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const teams = await prisma.team.findMany({
    include: {
      members: {
        include: { person: true },
        orderBy: { role: "asc" },
      },
    },
    orderBy: { name: "asc" },
  })

  return Response.json({ teams })
}

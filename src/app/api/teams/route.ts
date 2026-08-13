import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const dynamic = 'force-dynamic'

/**
 * Lightweight all-teams listing for any authenticated user — distinct from
 * /api/teams/my, which is intentionally membership-scoped for non-admins
 * (TopNav and the /teams page depend on that scoping for their own reasons,
 * unrelated to access control — team rosters aren't sensitive here; the org
 * chart is public elsewhere). This route exists so the Daily view's
 * reporter-team filter can offer every team, not just the signed-in user's
 * own.
 *
 * Deliberately a narrower select than /api/teams/my and /api/admin/teams:
 * this route's only consumers (DailyBudgetView, TeamFilterControl) need just
 * team id/name and each member's personId, not the full Person record those
 * other two routes' UIs display — so this isn't sharing a query builder with
 * them, it's a purpose-built lean one.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const teams = await prisma.team.findMany({
      select: {
        id: true,
        name: true,
        members: { select: { personId: true }, orderBy: { role: "asc" } },
      },
      orderBy: { name: "asc" },
    })

    return Response.json({ teams })
  } catch (error) {
    console.error("GET /api/teams error:", error)
    return Response.json({ error: "Failed to fetch teams" }, { status: 500 })
  }
}

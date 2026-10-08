import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { checkReadLimit } from "@/lib/api-helpers"

export const dynamic = 'force-dynamic'

/**
 * Every Newsroom Links category with its links, both in display order.
 * Readable by any signed-in user; writes go through /api/admin/links and
 * /api/admin/link-categories.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }
  const limited = checkReadLimit(session.user.id)
  if (limited) return limited

  try {
    const categories = await prisma.linkCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        links: {
          orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
          select: { id: true, title: true, url: true, note: true, categoryId: true },
        },
      },
    })
    return Response.json({ categories })
  } catch (error) {
    console.error("GET /api/links error:", error)
    return Response.json({ error: "Failed to fetch links" }, { status: 500 })
  }
}

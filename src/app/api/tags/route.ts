import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { checkReadLimit } from "@/lib/api-helpers"
import { ensureDefaultTags } from "@/lib/tags-server"

export const dynamic = 'force-dynamic'

/**
 * Every Tag, archived ones included — cards still have to render an archived
 * tag on the stories that carry it; pickers filter to active tags client-side
 * (see useTags()). Also the admin panel's data source, since it needs the same
 * rows; writes go through /api/admin/tags.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }
  const limited = checkReadLimit(session.user.id)
  if (limited) return limited

  try {
    await ensureDefaultTags()
    const tags = await prisma.tag.findMany({
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    })
    return Response.json({ tags })
  } catch (error) {
    console.error("GET /api/tags error:", error)
    return Response.json({ error: "Failed to fetch tags" }, { status: 500 })
  }
}

import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { reorderLinksSchema } from "@/lib/validations"
import { requireAdminWrite, validationErrorResponse } from "@/lib/api-helpers"
import { reorderUpdates } from "@/lib/links-server"

export const dynamic = 'force-dynamic'

/** Set the order of one category's links. `ids` must be every link in it. */
export async function PUT(req: NextRequest) {
  const { error } = await requireAdminWrite(req)
  if (error) return error

  const parsed = reorderLinksSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return validationErrorResponse(parsed.error)

  const { categoryId, ids } = parsed.data
  try {
    const current = await prisma.newsroomLink.findMany({
      where: { categoryId },
      select: { id: true, sortOrder: true },
    })
    const updates = reorderUpdates(ids, current)
    if (!updates) {
      return Response.json(
        { error: "These links changed since you loaded the page. Reload and try again." },
        { status: 409 }
      )
    }
    await prisma.$transaction(
      updates.map(({ id, sortOrder }) => prisma.newsroomLink.update({ where: { id }, data: { sortOrder } }))
    )
    return Response.json({ ok: true })
  } catch (err) {
    console.error("PUT /api/admin/links/order error:", err)
    return Response.json({ error: "Failed to reorder links" }, { status: 500 })
  }
}

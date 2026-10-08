import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { reorderLinkCategoriesSchema } from "@/lib/validations"
import { requireAdminWrite, validationErrorResponse } from "@/lib/api-helpers"
import { reorderUpdates } from "@/lib/links-server"

export const dynamic = 'force-dynamic'

/** Set the order of the categories on the page. `ids` must be every category. */
export async function PUT(req: NextRequest) {
  const { error } = await requireAdminWrite(req)
  if (error) return error

  const parsed = reorderLinkCategoriesSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return validationErrorResponse(parsed.error)

  try {
    const current = await prisma.linkCategory.findMany({ select: { id: true, sortOrder: true } })
    const updates = reorderUpdates(parsed.data.ids, current)
    if (!updates) {
      return Response.json(
        { error: "Categories changed since you loaded the page. Reload and try again." },
        { status: 409 }
      )
    }
    await prisma.$transaction(
      updates.map(({ id, sortOrder }) => prisma.linkCategory.update({ where: { id }, data: { sortOrder } }))
    )
    return Response.json({ ok: true })
  } catch (err) {
    console.error("PUT /api/admin/link-categories/order error:", err)
    return Response.json({ error: "Failed to reorder categories" }, { status: 500 })
  }
}

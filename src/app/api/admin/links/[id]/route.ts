import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { updateLinkSchema } from "@/lib/validations"
import { prismaErrorCode, requireAdminWrite, validationErrorResponse } from "@/lib/api-helpers"

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/** Edit a link. Changing `categoryId` moves it to the end of that category. */
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { error } = await requireAdminWrite(req)
  if (error) return error

  const parsed = updateLinkSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return validationErrorResponse(parsed.error)

  const { id } = await params
  try {
    const existing = await prisma.newsroomLink.findUnique({ where: { id }, select: { categoryId: true } })
    if (!existing) {
      return Response.json({ error: "Link not found" }, { status: 404 })
    }

    let sortOrder: number | undefined
    if (parsed.data.categoryId && parsed.data.categoryId !== existing.categoryId) {
      const max = await prisma.newsroomLink.aggregate({
        where: { categoryId: parsed.data.categoryId },
        _max: { sortOrder: true },
      })
      sortOrder = (max._max.sortOrder ?? -1) + 1
    }

    const link = await prisma.newsroomLink.update({
      where: { id },
      data: { ...parsed.data, ...(sortOrder === undefined ? {} : { sortOrder }) },
    })
    return Response.json({ link })
  } catch (err: unknown) {
    const code = prismaErrorCode(err)
    if (code === "P2025") {
      return Response.json({ error: "Link not found" }, { status: 404 })
    }
    if (code === "P2003") {
      return Response.json({ error: "That category no longer exists" }, { status: 404 })
    }
    console.error("PATCH /api/admin/links/[id] error:", err)
    return Response.json({ error: "Failed to update link" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const { error } = await requireAdminWrite(req, { json: false })
  if (error) return error

  const { id } = await params
  try {
    await prisma.newsroomLink.delete({ where: { id } })
    return new Response(null, { status: 204 })
  } catch (err: unknown) {
    if (prismaErrorCode(err) === "P2025") {
      return Response.json({ error: "Link not found" }, { status: 404 })
    }
    console.error("DELETE /api/admin/links/[id] error:", err)
    return Response.json({ error: "Failed to delete link" }, { status: 500 })
  }
}

import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { linkCategorySchema } from "@/lib/validations"
import { prismaErrorCode, requireAdminWrite, validationErrorResponse } from "@/lib/api-helpers"
import { categoryNameKey } from "@/lib/links-server"

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/** Rename a category. */
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { error } = await requireAdminWrite(req)
  if (error) return error

  const parsed = linkCategorySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return validationErrorResponse(parsed.error)

  const { id } = await params
  const { name } = parsed.data
  try {
    const category = await prisma.linkCategory.update({
      where: { id },
      data: { name, nameKey: categoryNameKey(name) },
    })
    return Response.json({ category })
  } catch (err: unknown) {
    const code = prismaErrorCode(err)
    if (code === "P2025") {
      return Response.json({ error: "Category not found" }, { status: 404 })
    }
    // nameKey is unique, so this covers "Wire" vs "wire" too.
    if (code === "P2002") {
      return Response.json({ error: "There's already a category with that name" }, { status: 409 })
    }
    console.error("PATCH /api/admin/link-categories/[id] error:", err)
    return Response.json({ error: "Failed to update category" }, { status: 500 })
  }
}

/**
 * Delete an empty category. One that still has links is refused (409) rather
 * than cascading, so an admin can't wipe a block of links with one click.
 */
export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const { error } = await requireAdminWrite(req, { json: false })
  if (error) return error

  const { id } = await params
  try {
    const count = await prisma.newsroomLink.count({ where: { categoryId: id } })
    if (count > 0) {
      return Response.json({ error: "Move or delete this category's links first" }, { status: 409 })
    }
    await prisma.linkCategory.delete({ where: { id } })
    return new Response(null, { status: 204 })
  } catch (err: unknown) {
    const code = prismaErrorCode(err)
    if (code === "P2025") {
      return Response.json({ error: "Category not found" }, { status: 404 })
    }
    // A link was added between the count and the delete (onDelete: Restrict).
    if (code === "P2003") {
      return Response.json({ error: "Move or delete this category's links first" }, { status: 409 })
    }
    console.error("DELETE /api/admin/link-categories/[id] error:", err)
    return Response.json({ error: "Failed to delete category" }, { status: 500 })
  }
}

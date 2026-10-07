import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { linkCategorySchema } from "@/lib/validations"
import { prismaErrorCode, requireAdminWrite, validationErrorResponse } from "@/lib/api-helpers"
import { categoryNameKey } from "@/lib/links-server"

export const dynamic = 'force-dynamic'

/** Add a Newsroom Links category at the end of the page. */
export async function POST(req: NextRequest) {
  const { error } = await requireAdminWrite(req)
  if (error) return error

  const parsed = linkCategorySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return validationErrorResponse(parsed.error)

  const { name } = parsed.data
  try {
    const max = await prisma.linkCategory.aggregate({ _max: { sortOrder: true } })
    const category = await prisma.linkCategory.create({
      data: { name, nameKey: categoryNameKey(name), sortOrder: (max._max.sortOrder ?? -1) + 1 },
    })
    return Response.json({ category }, { status: 201 })
  } catch (err: unknown) {
    // nameKey is unique, so this covers "Wire" vs "wire" too.
    if (prismaErrorCode(err) === "P2002") {
      return Response.json({ error: "There's already a category with that name" }, { status: 409 })
    }
    console.error("POST /api/admin/link-categories error:", err)
    return Response.json({ error: "Failed to add category" }, { status: 500 })
  }
}

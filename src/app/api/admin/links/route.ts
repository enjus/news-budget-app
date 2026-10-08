import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { createLinkSchema } from "@/lib/validations"
import { prismaErrorCode, requireAdminWrite, validationErrorResponse } from "@/lib/api-helpers"

export const dynamic = 'force-dynamic'

/** Add a link to the end of its category. */
export async function POST(req: NextRequest) {
  const { error } = await requireAdminWrite(req)
  if (error) return error

  // A malformed body parses as null and fails validation as a 400.
  const parsed = createLinkSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return validationErrorResponse(parsed.error)

  try {
    const max = await prisma.newsroomLink.aggregate({
      where: { categoryId: parsed.data.categoryId },
      _max: { sortOrder: true },
    })
    const link = await prisma.newsroomLink.create({
      data: {
        title: parsed.data.title,
        url: parsed.data.url,
        note: parsed.data.note ?? null,
        categoryId: parsed.data.categoryId,
        sortOrder: (max._max.sortOrder ?? -1) + 1,
      },
    })
    return Response.json({ link }, { status: 201 })
  } catch (err: unknown) {
    if (prismaErrorCode(err) === "P2003") {
      return Response.json({ error: "That category no longer exists" }, { status: 404 })
    }
    console.error("POST /api/admin/links error:", err)
    return Response.json({ error: "Failed to add link" }, { status: 500 })
  }
}

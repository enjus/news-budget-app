import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { updateTagSchema } from "@/lib/validations"
import { prismaErrorCode, requireAdminWrite, validationErrorResponse } from "@/lib/api-helpers"
import { findTagNameConflict } from "@/lib/tags-server"

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ key: string }> }

/**
 * Edit a tag's label/abbrev/color/icon, or archive/unarchive it. There is no
 * DELETE: archiving hides a tag from pickers while it keeps rendering on the
 * stories that already carry it. Enterprise and AI Contributed aren't Tag rows,
 * so they can't be reached here.
 */
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { error: denied } = await requireAdminWrite(req)
  if (denied) return denied

  // A malformed body parses as null and fails validation as a 400.
  const parsed = updateTagSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return validationErrorResponse(parsed.error)

  const { key } = await params
  const { archived, ...fields } = parsed.data
  try {
    // Empty and reserved names are rejected by the schema; this catches
    // near-duplicates of *other* tags that the case-sensitive label index misses.
    if (fields.label !== undefined) {
      const conflict = await findTagNameConflict(fields.label, key)
      if (conflict) {
        return Response.json({ error: `Too similar to the existing tag "${conflict.label}"` }, { status: 409 })
      }
    }

    const tag = await prisma.tag.update({
      where: { key },
      data: {
        ...fields,
        ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }),
      },
    })
    return Response.json({ tag })
  } catch (error: unknown) {
    const code = prismaErrorCode(error)
    if (code === "P2025") {
      return Response.json({ error: "Tag not found" }, { status: 404 })
    }
    if (code === "P2002") {
      return Response.json({ error: "A tag with that name already exists" }, { status: 409 })
    }
    console.error("PATCH /api/admin/tags/[key] error:", error)
    return Response.json({ error: "Failed to update tag" }, { status: 500 })
  }
}

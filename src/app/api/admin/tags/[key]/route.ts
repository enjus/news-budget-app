import { NextRequest } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { updateTagSchema } from "@/lib/validations"
import { hasAdminAccess } from "@/lib/utils"
import { checkWriteLimit, requireJSON, prismaErrorCode } from "@/lib/api-helpers"
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
  const session = await getServerSession(authOptions)
  if (!session || !hasAdminAccess(session.user.appRole)) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  const limited = checkWriteLimit(session.user.id)
  if (limited) return limited
  const badType = requireJSON(req)
  if (badType) return badType

  const parsed = updateTagSchema.safeParse(await req.json())
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors
    // The admin UI toasts `error`, so surface the first specific message.
    const first = Object.values(fieldErrors).flat()[0]
    return Response.json({ error: first ?? "Validation failed", fieldErrors }, { status: 400 })
  }

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

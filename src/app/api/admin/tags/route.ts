import { NextRequest } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createTagSchema } from "@/lib/validations"
import { hasAdminAccess } from "@/lib/utils"
import { checkWriteLimit, requireJSON, prismaErrorCode } from "@/lib/api-helpers"
import { labelToTagKey } from "@/lib/tags"
import { ensureDefaultTags, findTagNameConflict } from "@/lib/tags-server"

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !hasAdminAccess(session.user.appRole)) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  const limited = checkWriteLimit(session.user.id)
  if (limited) return limited
  const badType = requireJSON(req)
  if (badType) return badType

  const parsed = createTagSchema.safeParse(await req.json())
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors
    // The admin UI toasts `error`, so surface the first specific message.
    const first = Object.values(fieldErrors).flat()[0]
    return Response.json({ error: first ?? "Validation failed", fieldErrors }, { status: 400 })
  }

  // The key is derived once from the label and never changes, so renames
  // don't break existing StoryTag rows or /tags/[slug] URLs. Empty and
  // reserved (Enterprise / AI Contributed) names are rejected by the schema.
  const key = labelToTagKey(parsed.data.label)

  try {
    // Make sure a default tag can't be shadowed by an admin tag created before
    // the defaults were first inserted on a fresh DB.
    await ensureDefaultTags()

    const conflict = await findTagNameConflict(parsed.data.label)
    if (conflict) {
      return Response.json(
        {
          error: conflict.archivedAt
            ? `Too similar to the archived tag "${conflict.label}" — unarchive it instead`
            : `Too similar to the existing tag "${conflict.label}"`,
        },
        { status: 409 }
      )
    }

    const max = await prisma.tag.aggregate({ _max: { sortOrder: true } })
    const tag = await prisma.tag.create({
      data: {
        key,
        label: parsed.data.label,
        abbrev: parsed.data.abbrev ?? null,
        color: parsed.data.color,
        icon: parsed.data.icon ?? null,
        sortOrder: (max._max.sortOrder ?? -1) + 1,
      },
    })
    return Response.json({ tag }, { status: 201 })
  } catch (error: unknown) {
    if (prismaErrorCode(error) === "P2002") {
      return Response.json({ error: "A tag with that name already exists" }, { status: 409 })
    }
    console.error("POST /api/admin/tags error:", error)
    return Response.json({ error: "Failed to create tag" }, { status: 500 })
  }
}

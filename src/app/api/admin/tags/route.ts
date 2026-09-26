import { NextRequest } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createTagSchema } from "@/lib/validations"
import { hasAdminAccess } from "@/lib/utils"
import { checkWriteLimit, requireJSON, prismaErrorCode } from "@/lib/api-helpers"
import { labelToTagKey, RESERVED_TAG_KEYS } from "@/lib/tags"
import { ensureDefaultTags } from "@/lib/tags-server"

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
    return Response.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  // The key is derived once from the label and never changes, so renames
  // don't break existing StoryTag rows or /tags/[slug] URLs.
  const key = labelToTagKey(parsed.data.label)
  if (!key) {
    return Response.json({ error: "Label must contain at least one letter or number" }, { status: 400 })
  }
  if ((RESERVED_TAG_KEYS as readonly string[]).includes(key)) {
    return Response.json({ error: `"${parsed.data.label}" is a built-in indicator and can't be used as a tag name` }, { status: 400 })
  }

  try {
    // Make sure a default tag can't be shadowed by an admin tag created before
    // the defaults were first inserted on a fresh DB.
    await ensureDefaultTags()

    const existing = await prisma.tag.findUnique({ where: { key } })
    if (existing) {
      return Response.json(
        {
          error: existing.archivedAt
            ? `An archived tag "${existing.label}" already uses this name — unarchive it instead`
            : `A tag named "${existing.label}" already exists`,
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

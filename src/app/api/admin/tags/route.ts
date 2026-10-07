import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { createTagSchema } from "@/lib/validations"
import { prismaErrorCode, requireAdminWrite, validationErrorResponse } from "@/lib/api-helpers"
import { labelToTagKey } from "@/lib/tags"
import { ensureDefaultTags, findTagNameConflict } from "@/lib/tags-server"

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { error: denied } = await requireAdminWrite(req)
  if (denied) return denied

  // A malformed body parses as null and fails validation as a 400.
  const parsed = createTagSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return validationErrorResponse(parsed.error)

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

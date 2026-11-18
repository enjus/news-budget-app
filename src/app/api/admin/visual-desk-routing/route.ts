import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { hasAdminAccess } from "@/lib/utils"
import { checkReadLimit, requireAdminWrite } from "@/lib/api-helpers"
import {
  DESK_EMAIL_ENV,
  DESK_LIST_MAX_LENGTH,
  DESK_TYPES,
  parseEmailList,
  resolveDeskRecipients,
  validateEmailList,
} from "@/lib/visual-notifications"

export const dynamic = 'force-dynamic'

/** One type's routing, as /admin/visual-requests shows it. Keep in sync with DeskRoutingEntry in the view. */
async function routingEntries() {
  const rows = await prisma.visualDeskRouting.findMany({
    select: { type: true, emails: true, updatedAt: true, updatedById: true, updatedBy: { select: { name: true } } },
  })
  return DESK_TYPES.map((type) => {
    const row = rows.find((r) => r.type === type) ?? null
    const envVar = DESK_EMAIL_ENV[type]
    const { emails, source } = resolveDeskRecipients(type, process.env, rows)
    return {
      type,
      /** The list saved on this page, or null when the type uses its fallback. */
      saved: row ? parseEmailList(row.emails) : null,
      updatedAt: row?.updatedAt ?? null,
      /** Null when nothing is saved, or the saving user has since been deleted. */
      updatedByName: row?.updatedBy?.name ?? null,
      envVar,
      envEmails: parseEmailList(process.env[envVar]),
      /** Who a request of this type would actually email right now. */
      effective: emails,
      source,
    }
  })
}

/**
 * Desk routing for /admin/visual-requests: per type, the saved list, who saved
 * it and when, the env fallback, and what it resolves to. Admin only. Reading
 * the env vars here is fine: server-side, admin-only, and the addresses aren't
 * secret.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !hasAdminAccess(session.user.appRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const limited = checkReadLimit(session.user.id)
    if (limited) return limited

    return NextResponse.json({ entries: await routingEntries() })
  } catch (error) {
    console.error("GET /api/admin/visual-desk-routing error:", error)
    return NextResponse.json({ error: "Failed to load desk routing" }, { status: 500 })
  }
}

const putSchema = z.object({
  type: z.enum(DESK_TYPES),
  // Length is checked again by validateEmailList with a friendlier message; this caps the body.
  emails: z.string().max(DESK_LIST_MAX_LENGTH * 2),
})

/**
 * Save one type's list. Invalid addresses are a 400 naming each one
 * (`errors`). An empty list deletes the row, returning the type to its
 * fallback; it does not turn the email off. Returns the refreshed entries.
 */
export async function PUT(req: NextRequest) {
  const { session, error: denied } = await requireAdminWrite(req)
  if (denied) return denied

  const parsed = putSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Send a visual type and an address list" }, { status: 400 })
  }
  const { type } = parsed.data

  const list = validateEmailList(parsed.data.emails)
  if (!list.ok) {
    return NextResponse.json({ error: list.errors[0].message, errors: list.errors }, { status: 400 })
  }

  try {
    if (list.emails.length === 0) {
      await prisma.visualDeskRouting.deleteMany({ where: { type } })
    } else {
      const emails = list.emails.join(", ")
      await prisma.visualDeskRouting.upsert({
        where: { type },
        create: { type, emails, updatedById: session.user.id },
        update: { emails, updatedById: session.user.id },
      })
    }
    return NextResponse.json({ entries: await routingEntries() })
  } catch (error) {
    console.error("PUT /api/admin/visual-desk-routing error:", error)
    return NextResponse.json({ error: "Failed to save desk routing" }, { status: 500 })
  }
}

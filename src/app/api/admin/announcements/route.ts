import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { createAnnouncementSchema } from "@/lib/validations"
import { requireAdminWrite, validationErrorResponse } from "@/lib/api-helpers"
import { dateOnly, todayString } from "@/lib/utils"

export const dynamic = 'force-dynamic'

/** Post a homepage announcement. */
export async function POST(req: NextRequest) {
  const { error } = await requireAdminWrite(req)
  if (error) return error

  // A malformed body parses as null and fails validation as a 400.
  const parsed = createAnnouncementSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return validationErrorResponse(parsed.error)

  const { title, body, url, endDate } = parsed.data
  // An already-expired announcement would save and never show.
  if (endDate && endDate < todayString()) {
    return Response.json({ error: "The last day to show it is already past" }, { status: 400 })
  }

  try {
    const announcement = await prisma.announcement.create({
      data: { title, body: body ?? null, url: url ?? null, endDate: endDate ? dateOnly(endDate) : null },
    })
    return Response.json({ announcement }, { status: 201 })
  } catch (err) {
    console.error("POST /api/admin/announcements error:", err)
    return Response.json({ error: "Failed to post announcement" }, { status: 500 })
  }
}

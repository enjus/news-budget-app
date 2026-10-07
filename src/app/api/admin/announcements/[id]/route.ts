import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { updateAnnouncementSchema } from "@/lib/validations"
import { prismaErrorCode, requireAdminWrite, validationErrorResponse } from "@/lib/api-helpers"
import { dateOnly, todayString } from "@/lib/utils"

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { error } = await requireAdminWrite(req)
  if (error) return error

  const parsed = updateAnnouncementSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return validationErrorResponse(parsed.error)

  const { endDate, ...fields } = parsed.data
  if (endDate && endDate < todayString()) {
    return Response.json({ error: "The last day to show it is already past" }, { status: 400 })
  }

  const { id } = await params
  try {
    const announcement = await prisma.announcement.update({
      where: { id },
      data: {
        ...fields,
        ...(endDate === undefined ? {} : { endDate: endDate ? dateOnly(endDate) : null }),
      },
    })
    return Response.json({ announcement })
  } catch (err: unknown) {
    if (prismaErrorCode(err) === "P2025") {
      return Response.json({ error: "Announcement not found" }, { status: 404 })
    }
    console.error("PATCH /api/admin/announcements/[id] error:", err)
    return Response.json({ error: "Failed to update announcement" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const { error } = await requireAdminWrite(req, { json: false })
  if (error) return error

  const { id } = await params
  try {
    await prisma.announcement.delete({ where: { id } })
    return new Response(null, { status: 204 })
  } catch (err: unknown) {
    if (prismaErrorCode(err) === "P2025") {
      return Response.json({ error: "Announcement not found" }, { status: 404 })
    }
    console.error("DELETE /api/admin/announcements/[id] error:", err)
    return Response.json({ error: "Failed to delete announcement" }, { status: 500 })
  }
}

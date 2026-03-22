import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { hasAdminAccess } from "@/lib/utils"
import { updateUserSchema } from "@/lib/validations"
import { checkWriteLimit } from "@/lib/api-helpers"

export const dynamic = 'force-dynamic'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || !hasAdminAccess(session.user.appRole)) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  const limited = checkWriteLimit(session.user.id)
  if (limited) return limited

  const { id } = await params
  const body = await req.json()
  const result = updateUserSchema.safeParse(body)

  if (!result.success) {
    return Response.json(
      { error: "Validation failed", fieldErrors: result.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { password, personId, ...rest } = result.data

  const data: Record<string, unknown> = { ...rest }
  if (personId !== undefined) data.personId = personId ?? null
  if (password) data.passwordHash = await bcrypt.hash(password, 12)

  try {
    const user = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, email: true, name: true, appRole: true },
    })

    return Response.json({ user })
  } catch (error: any) {
    if (error?.code === "P2025") {
      return Response.json({ error: "User not found" }, { status: 404 })
    }
    if (error?.code === "P2002") {
      return Response.json({ error: "A user with that email already exists" }, { status: 409 })
    }
    console.error("PATCH /api/admin/users/[id] error:", error)
    return Response.json({ error: "Failed to update user" }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || !hasAdminAccess(session.user.appRole)) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  const limited = checkWriteLimit(session.user.id)
  if (limited) return limited

  const { id } = await params

  // Prevent admins from deleting themselves
  if (id === session.user.id) {
    return Response.json({ error: "Cannot delete your own account" }, { status: 400 })
  }

  try {
    await prisma.user.delete({ where: { id } })
    return new Response(null, { status: 204 })
  } catch (error: any) {
    if (error?.code === "P2025") {
      return Response.json({ error: "User not found" }, { status: 404 })
    }
    console.error("DELETE /api/admin/users/[id] error:", error)
    return Response.json({ error: "Failed to delete user" }, { status: 500 })
  }
}

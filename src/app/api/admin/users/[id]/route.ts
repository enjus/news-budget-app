import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

export const dynamic = 'force-dynamic'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.appRole !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()
  const { email, name, appRole, password, personId } = body

  const data: Record<string, unknown> = {}
  if (email !== undefined) data.email = email
  if (name !== undefined) data.name = name
  if (appRole !== undefined) data.appRole = appRole
  if (personId !== undefined) data.personId = personId || null
  if (password) data.passwordHash = await bcrypt.hash(password, 12)

  const user = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, email: true, name: true, appRole: true },
  })

  return Response.json({ user })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.appRole !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params

  // Prevent admins from deleting themselves
  if (id === session.user.id) {
    return Response.json({ error: "Cannot delete your own account" }, { status: 400 })
  }

  await prisma.user.delete({ where: { id } })
  return new Response(null, { status: 204 })
}

import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { hasAdminAccess } from "@/lib/utils"

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || !hasAdminAccess(session.user.appRole)) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      appRole: true,
      personId: true,
      createdAt: true,
      person: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  })

  return Response.json({ users })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !hasAdminAccess(session.user.appRole)) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const { email, name, password, appRole } = body

  if (!email || !name || !password) {
    return Response.json({ error: "email, name, and password are required" }, { status: 400 })
  }

  const exists = await prisma.user.findUnique({ where: { email } })
  if (exists) {
    return Response.json({ error: "A user with that email already exists" }, { status: 409 })
  }

  const passwordHash = await bcrypt.hash(password, 12)

  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      appRole: appRole ?? "PRODUCER",
    },
    select: { id: true, email: true, name: true, appRole: true },
  })

  return Response.json({ user }, { status: 201 })
}

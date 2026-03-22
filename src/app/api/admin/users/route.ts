import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { hasAdminAccess } from "@/lib/utils"
import { createUserSchema } from "@/lib/validations"
import { checkWriteLimit } from "@/lib/api-helpers"

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

  const limited = checkWriteLimit(session.user.id)
  if (limited) return limited

  const body = await req.json()
  const result = createUserSchema.safeParse(body)

  if (!result.success) {
    return Response.json(
      { error: "Validation failed", fieldErrors: result.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { email, name, password, appRole, personId } = result.data

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
      appRole,
      personId: personId ?? null,
    },
    select: { id: true, email: true, name: true, appRole: true },
  })

  return Response.json({ user }, { status: 201 })
}

import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createTeamSchema } from "@/lib/validations"
import { hasAdminAccess } from "@/lib/utils"

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || !hasAdminAccess(session.user.appRole)) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  const teams = await prisma.team.findMany({
    include: {
      members: {
        include: { person: true },
        orderBy: { role: "asc" }, // EDITORs first, then MEMBERs
      },
      _count: { select: { members: true } },
    },
    orderBy: { name: "asc" },
  })

  return Response.json({ teams })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !hasAdminAccess(session.user.appRole)) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const parsed = createTeamSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  try {
    const team = await prisma.team.create({
      data: parsed.data,
      include: {
        members: { include: { person: true } },
        _count: { select: { members: true } },
      },
    })
    return Response.json({ team }, { status: 201 })
  } catch (e: unknown) {
    if (typeof e === "object" && e !== null && "code" in e && e.code === "P2002") {
      return Response.json({ error: "A team with that name already exists" }, { status: 409 })
    }
    throw e
  }
}

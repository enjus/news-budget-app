import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { updateTeamSchema } from "@/lib/validations"
import { hasAdminAccess } from "@/lib/utils"
import { checkWriteLimit } from "@/lib/api-helpers"

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || !hasAdminAccess(session.user.appRole)) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const team = await prisma.team.findUnique({
    where: { id },
    include: {
      members: {
        include: { person: true },
        orderBy: { role: "asc" },
      },
    },
  })

  if (!team) {
    return Response.json({ error: "Team not found" }, { status: 404 })
  }

  return Response.json({ team })
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || !hasAdminAccess(session.user.appRole)) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  const limited = checkWriteLimit(session.user.id)
  if (limited) return limited

  const { id } = await params
  const body = await req.json()
  const parsed = updateTeamSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  try {
    const team = await prisma.team.update({
      where: { id },
      data: parsed.data,
      include: {
        members: { include: { person: true } },
      },
    })
    return Response.json({ team })
  } catch (e: unknown) {
    if (typeof e === "object" && e !== null && "code" in e && e.code === "P2002") {
      return Response.json({ error: "A team with that name already exists" }, { status: 409 })
    }
    throw e
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
  await prisma.team.delete({ where: { id } })
  return new Response(null, { status: 204 })
}

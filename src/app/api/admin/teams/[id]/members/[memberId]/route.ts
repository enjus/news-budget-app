import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { updateTeamMemberSchema } from "@/lib/validations"
import { hasAdminAccess } from "@/lib/utils"
import { checkWriteLimit } from "@/lib/api-helpers"

export const dynamic = 'force-dynamic'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; memberId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || !hasAdminAccess(session.user.appRole)) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  const limited = checkWriteLimit(session.user.id)
  if (limited) return limited

  const { id: teamId, memberId } = await params
  const body = await req.json()
  const parsed = updateTeamMemberSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  // Scoped by teamId too, so a memberId from another team's URL 404s.
  const { count } = await prisma.teamMember.updateMany({
    where: { id: memberId, teamId },
    data: { role: parsed.data.role },
  })
  if (count === 0) {
    return Response.json({ error: "Member not found" }, { status: 404 })
  }
  return new Response(null, { status: 204 })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; memberId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || !hasAdminAccess(session.user.appRole)) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  const limited = checkWriteLimit(session.user.id)
  if (limited) return limited

  const { memberId } = await params
  await prisma.teamMember.delete({ where: { id: memberId } })
  return new Response(null, { status: 204 })
}

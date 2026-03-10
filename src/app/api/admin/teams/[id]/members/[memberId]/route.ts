import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const dynamic = 'force-dynamic'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; memberId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.appRole !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  const { memberId } = await params
  await prisma.teamMember.delete({ where: { id: memberId } })
  return new Response(null, { status: 204 })
}

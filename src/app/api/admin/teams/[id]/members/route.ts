import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { addTeamMemberSchema } from "@/lib/validations"
import { hasAdminAccess } from "@/lib/utils"
import { checkWriteLimit } from "@/lib/api-helpers"

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || !hasAdminAccess(session.user.appRole)) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  const limited = checkWriteLimit(session.user.id)
  if (limited) return limited

  const { id: teamId } = await params
  const body = await req.json()
  const parsed = addTeamMemberSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  try {
    const member = await prisma.teamMember.create({
      data: {
        teamId,
        personId: parsed.data.personId,
        role: parsed.data.role,
      },
      include: { person: true },
    })
    return Response.json({ member }, { status: 201 })
  } catch (e: unknown) {
    if (typeof e === "object" && e !== null && "code" in e && e.code === "P2002") {
      return Response.json({ error: "This person is already on the team" }, { status: 409 })
    }
    throw e
  }
}

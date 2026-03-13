import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { MediaRequestDashboard } from "@/components/media-requests/MediaRequestDashboard"

const SPECIALIST_ROLES = ["PHOTOGRAPHER", "VIDEOGRAPHER", "GRAPHIC_DESIGNER"]

export default async function MediaRequestsPage() {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    redirect("/login")
  }

  const isAdmin = session.user.appRole === "ADMIN"
  let isSpecialist = false

  if (session.user.personId) {
    const person = await prisma.person.findUnique({
      where: { id: session.user.personId },
      select: { defaultRole: true },
    })
    if (person && SPECIALIST_ROLES.includes(person.defaultRole)) {
      isSpecialist = true
    }
  }

  // Non-specialists/non-admins see "my requests" view
  if (!isAdmin && !isSpecialist) {
    redirect("/media-requests/my")
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <MediaRequestDashboard />
    </div>
  )
}

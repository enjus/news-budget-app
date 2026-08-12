import { Suspense } from "react"
import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth"
import { canViewPeople } from "@/lib/utils"
import { PersonView } from "./PersonView"

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || !canViewPeople(session.user.appRole)) {
    redirect("/budget/daily")
  }

  const { id } = await params
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Suspense>
        <PersonView id={id} />
      </Suspense>
    </div>
  )
}

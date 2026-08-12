import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth"
import { canViewPeople } from "@/lib/utils"
import { PersonListSection } from "./PersonListSection"

export default async function PeoplePage() {
  const session = await getServerSession(authOptions)
  if (!session || !canViewPeople(session.user.appRole)) {
    redirect("/budget/daily")
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <PersonListSection />
    </div>
  )
}

import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { canEditPrint } from "@/lib/utils"
import { EditionView } from "./EditionView"

export default async function EditionPage() {
  const session = await getServerSession(authOptions)
  if (!session || !canEditPrint(session.user.appRole)) {
    redirect("/budget/daily")
  }
  return <EditionView />
}

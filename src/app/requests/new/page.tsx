import { redirect } from "next/navigation"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { canCreateContent } from "@/lib/utils"
import { NewRequestView } from "./NewRequestView"

/** Standalone filing. Content creators only, the same rule POST /api/visuals applies. */
export default async function NewRequestPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !canCreateContent(session.user.appRole)) {
    redirect("/requests")
  }
  return <NewRequestView />
}

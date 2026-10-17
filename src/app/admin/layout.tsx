import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { hasAdminAccess } from "@/lib/utils"
import { sectionMetadata } from "@/lib/nav"

export const metadata = sectionMetadata("admin")

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session || !hasAdminAccess(session.user.appRole)) {
    redirect("/")
  }
  return <>{children}</>
}

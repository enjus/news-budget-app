"use client"

import { useSession } from "next-auth/react"
import { useLinks } from "@/lib/hooks/useLinks"
import { hasAdminAccess } from "@/lib/utils"
import { LinksView } from "./LinksView"

export function LinksWrapper() {
  const { data: session } = useSession()
  const { categories, hasData, isLoading, error, mutate } = useLinks()

  return (
    <LinksView
      categories={categories}
      isLoading={isLoading}
      // SWR keeps the last error alongside cached data; only treat it as a
      // failure when there's nothing loaded to show.
      loadFailed={!!error && !hasData}
      isAdmin={!!session && hasAdminAccess(session.user.appRole)}
      mutate={mutate}
    />
  )
}

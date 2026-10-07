"use client"

import { useSession } from "next-auth/react"
import { useLinks } from "@/lib/hooks/useLinks"
import { useAnnouncements } from "@/lib/hooks/useAnnouncements"
import { hasAdminAccess } from "@/lib/utils"
import { LinksView } from "./LinksView"

export function LinksWrapper() {
  const { data: session } = useSession()
  const { categories, hasData, isLoading, error, mutate } = useLinks()
  const ann = useAnnouncements()

  return (
    <LinksView
      categories={categories}
      isLoading={isLoading}
      // SWR keeps the last error alongside cached data; only treat it as a
      // failure when there's nothing loaded to show.
      loadFailed={!!error && !hasData}
      isAdmin={!!session && hasAdminAccess(session.user.appRole)}
      mutate={mutate}
      announcements={ann.announcements}
      recentlyEnded={ann.recentlyEnded}
      announcementsState={ann.hasData ? "ready" : ann.error ? "failed" : "loading"}
      mutateAnnouncements={ann.mutate}
    />
  )
}

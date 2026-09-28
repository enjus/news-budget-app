import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { useMyTeams } from "@/lib/hooks/useTeams"
import { navSections, sectionForPath } from "@/lib/nav"

/** Nav sections for the current viewer, plus which one owns the current path. */
export function useNav() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const { teams } = useMyTeams()

  const sections = navSections({
    appRole: session?.user?.appRole ?? "",
    personId: session?.user?.personId,
    teamsLabel: teams.length === 1 ? teams[0].name : "Team",
  })
  const currentId = sectionForPath(pathname)

  return {
    pathname,
    sections,
    /** Owns the current path even if its top-bar entry is flagged off. */
    current: sections.find((s) => s.id === currentId) ?? null,
  }
}

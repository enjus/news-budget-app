import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { useMyTeamsSummary } from "@/lib/hooks/useTeams"
import { navSections, sectionForPath } from "@/lib/nav"
import { canViewMyTeams } from "@/lib/utils"

/** Nav sections for the current viewer, plus which one owns the current path. */
export function useNav() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const appRole = session?.user?.appRole ?? ""
  // Team names only feed the Team tab's label, so skip the fetch for anyone
  // who doesn't get that tab — including signed-out pages like /login.
  const { teams } = useMyTeamsSummary(canViewMyTeams(appRole))

  const sections = navSections({
    appRole,
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

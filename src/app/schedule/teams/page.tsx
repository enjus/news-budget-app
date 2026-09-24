import { Suspense } from "react"
import { TeamsWrapper } from "./TeamsWrapper"

// No nav entry yet — reachable only by direct URL until the newsroom is
// ready to be pointed at the schedule (issue #19 §5, §11). Auth itself is
// handled by the global NextAuth middleware, same as every other route.
export default function ScheduleTeamsPage() {
  // TeamsWrapper reads ?scope= via useSearchParams, which needs a Suspense
  // boundary above it.
  return (
    <Suspense>
      <TeamsWrapper />
    </Suspense>
  )
}

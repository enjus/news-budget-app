import { Suspense } from "react"
import { TeamsWrapper } from "./TeamsWrapper"

// Auth is handled by the global NextAuth middleware, same as every other route.
export default function ScheduleTeamsPage() {
  // TeamsWrapper reads ?scope= via useSearchParams, which needs a Suspense
  // boundary above it.
  return (
    <Suspense>
      <TeamsWrapper />
    </Suspense>
  )
}

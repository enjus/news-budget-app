import { Suspense } from "react"
import { ShiftsWrapper } from "./ShiftsWrapper"

// Auth is handled by the global NextAuth middleware, same as every other route.
export default function ScheduleShiftsPage() {
  // ShiftsWrapper reads ?start= via useSearchParams, which needs a Suspense
  // boundary above it.
  return (
    <Suspense>
      <ShiftsWrapper />
    </Suspense>
  )
}

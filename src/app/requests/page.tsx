import { Suspense } from "react"
import { RequestsView } from "./RequestsView"

// RequestsView reads its filters from the URL (useSearchParams), which needs a
// Suspense boundary to build.
export default function RequestsPage() {
  return (
    <Suspense>
      <RequestsView />
    </Suspense>
  )
}

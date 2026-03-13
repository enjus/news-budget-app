import { Suspense } from "react"
import { NewMediaRequestView } from "./NewMediaRequestView"

export default function NewMediaRequestPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Suspense>
        <NewMediaRequestView />
      </Suspense>
    </div>
  )
}

import { Suspense } from "react"
import { MediaRequestDetailWrapper } from "./MediaRequestDetailWrapper"

export default async function MediaRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Suspense>
        <MediaRequestDetailWrapper id={id} />
      </Suspense>
    </div>
  )
}

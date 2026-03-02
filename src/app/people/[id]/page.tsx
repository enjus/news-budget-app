import { Suspense } from "react"
import { PersonView } from "./PersonView"

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Suspense>
        <PersonView id={id} />
      </Suspense>
    </div>
  )
}

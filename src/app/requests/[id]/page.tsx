import { RequestDetailWrapper } from "./RequestDetailWrapper"

interface RequestPageProps {
  params: Promise<{ id: string }>
}

/** A visual request's page. Signed-in users only (the auth proxy); the data loads client-side. */
export default async function RequestPage({ params }: RequestPageProps) {
  const { id } = await params
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <RequestDetailWrapper id={id} />
    </div>
  )
}
